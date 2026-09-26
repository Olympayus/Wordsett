//! 系统级离线 TTS（spec §5.3、00 篇 §3.2）。
//!
//! 全局单一实例：新播放先 stop 旧播放，避免连续出题时两条音轨叠读。
//! 探测命令单独暴露，供前端在启动时决定听辨题型是否上线。

use std::sync::Mutex;
use tts::Tts;

/// SAPI5 回退后端。只在 Windows 上编译：`windows` crate 与 SAPI5 本身都是 Win32 专属，
/// 而 release.yml 也要出 macOS 包（`.github/workflows/release.yml`），故按 target 门掉。
#[cfg(windows)]
pub mod sapi;

/// 后端枚举。选定后不再变：探测跑过一次就定下走哪条路，`speak` 复用同一实例。
enum Backend {
    /// WinRT（`SpeechSynthesizer`）。agile，可从任意线程调用，故直接放静态量。
    /// 非 Windows 上 `tts` crate 走系统原生朗读（macOS 是 AppKit/NSSpeechSynthesizer），
    /// 同样经由这个变体承载——差别只在探测时报告的标签。
    WinRt(Tts),
    /// SAPI5。单元线程，内部自带专属线程，外部调用是投递消息。
    #[cfg(windows)]
    Sapi(sapi::SapiWorker),
}

/// 全局单例。Tts 不是 Send 友好的并发对象，用 Mutex 串行化全部访问。
///
/// tts 0.26 内部是 `Rc<RwLock<..>>` 却用 `unsafe impl Send/Sync` 放行
/// （tts-0.26.3/src/lib.rs:262-266），本文件能放进 static 正是靠这两个 impl。
/// 真实约束靠「不注册任何 utterance 回调」守住：回调由 WinRT 事件线程触发、
/// 闭包不受 Send 约束，一旦注册就可能绕过这把锁。同步的 speak/stop/voices
/// 全部经此锁串行，不与事件线程并发触碰同一实例。
static ENGINE: Mutex<Option<Backend>> = Mutex::new(None);

/// 语言标识是否算英文。容错匹配：`en` / `en-US` / `en_GB` / `EN-us` 都收。
///
/// 泛型收 `AsRef<str>`：单测传 `&str`，探测命令直接传 `Voice::language()`
/// 返回的 `LanguageTag<String>`（其 `AsRef<str>` 转发到内部 tag，
/// 见 oxilangtag-0.1.6/src/lib.rs:391），无需手工 `as_str()`。
pub fn is_english_voice<L: AsRef<str>>(language: L) -> bool {
    let l = language.as_ref().trim().to_ascii_lowercase();
    l == "en" || l.starts_with("en-") || l.starts_with("en_")
}

/// 探测结果（spec §6.2）。**前端契约，字段名不可变**（camelCase，见 lib.rs:79-81 的同款约束）。
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceProbe {
    /// 是否可用。门控方向不变：false 时听辨题下线（fail-closed）。
    available: bool,
    /// 生效的后端：`"winrt"` / `"sapi"` / `"native"`（非 Windows）。不可用时为 None。
    backend: Option<String>,
    /// 音色显示名，如 `"Microsoft Zira Desktop"`。不可用时为 None。
    voice: Option<String>,
    /// 不可用的原因（诊断面用，spec §6.4）。可用时为 None。
    reason: Option<String>,
}

impl VoiceProbe {
    fn unavailable(reason: impl Into<String>) -> Self {
        Self {
            available: false,
            backend: None,
            voice: None,
            reason: Some(reason.into()),
        }
    }

    /// 本次可用、音色名已知。
    fn available(backend: &str, voice: Option<String>) -> Self {
        Self {
            available: true,
            backend: Some(backend.into()),
            voice,
            reason: None,
        }
    }
}

/// 探测结果：**除了**判定「系统里有没有英文音色」，还要把这个音色选中。
///
/// 判据与行为必须在同一处收口。WinRT 后端在 `WinRt::new()` 时把
/// `voice` 钉成 `SpeechSynthesizer::DefaultVoice()`（winrt.rs:138），此后的每次
/// speak 都用这个字段（winrt.rs:182 的 `voice: self.voice.clone()`、winrt.rs:191 的
/// `synth.SetVoice(&self.voice)`）。只判存在而不选中，探测在 zh-CN 机器上照样返回
/// true，听辨题照样上线，却用中文嗓音念英文——正是 spec §5.2 要防的那件事。
///
/// 所以：find 到英文音色就 `set_voice` 选中它；`set_voice` 失败（音色在枚举与
/// 选取之间消失、或后端不支持 voice 特性）视为探测失败，返回 false 让听辨题下线。
/// 选中态存在单例上，speak 复用同一实例，不逐次重选。
fn english_voice(engine: &mut Tts) -> std::result::Result<Option<tts::Voice>, String> {
    let voices = engine.voices().map_err(|e| e.to_string())?;
    let english = voices.into_iter().find(|v| is_english_voice(v.language()));
    match english {
        None => Ok(None),
        Some(v) => {
            engine.set_voice(&v).map_err(|e| e.to_string())?;
            Ok(Some(v))
        }
    }
}

/// 探测报告里的后端标签。**只是标签**：非 Windows 上 `tts` crate 走系统原生朗读
/// （macOS 是 AppKit/NSSpeechSynthesizer），音色枚举与英文判定的实际工作由同一个
/// `tts` crate 完成，与 Windows 上的 WinRT 分支同构，故**不另开一条探测路径**
/// ——那会让 macOS 白白丢掉 fail-closed 门控（恒报可用）。spec §0.3 要求本版本
/// 不改 macOS 的 TTS 路径，这里正是「保持原样，只改标签」。
#[cfg(windows)]
const BACKEND_LABEL: &str = "winrt";
#[cfg(not(windows))]
const BACKEND_LABEL: &str = "native";

/// 已建立 WinRT 引擎后的可用性回报。**真的重跑一次 `english_voice`**，不复用旧结论。
///
/// 为什么必须重跑：`speak` 在探测没跑过时也会建 `Backend::WinRt`（见 speak 里
/// 「探测没跑过」那条注释），而那个实例用的是**后端默认音色**（zh-CN 机器上就是中文）。
/// 若这里只看枚举变体就报 available，等于把「用中文嗓音念英文」这个恰恰要防的事放过去了
/// ——门控会 fail-open。顺带把音色名重新带回来：这条路径返回的名字现在是真的，不是 None。
fn winrt_english_voice_available(engine: &mut Tts) -> VoiceProbe {
    match english_voice(engine) {
        Ok(Some(v)) => {
            eprintln!("[tts] english voice selected: {} ({})", v.name(), v.language());
            VoiceProbe::available(BACKEND_LABEL, Some(v.name().to_string()))
        }
        Ok(None) => VoiceProbe::unavailable(no_english_voice_reason()),
        Err(e) => {
            eprintln!("[tts] could not select an english voice: {e}");
            VoiceProbe::unavailable(format!("英文音色选取失败：{e}"))
        }
    }
}

/// 所有后端都找不到英文音色时给用户的同一句原因（诊断面显示，spec §6.4）。
fn no_english_voice_reason() -> String {
    "系统里没有英文音色；按设置页指引装一个英文语音包后重启".to_string()
}

/// 取（必要时建立）WinRT 引擎。锁由调用方持有。
fn winrt_engine(engine: &mut Option<Backend>) -> Result<&mut Tts, String> {
    if engine.is_none() {
        let t = Tts::default().map_err(|e| e.to_string())?;
        *engine = Some(Backend::WinRt(t));
    }
    match engine.as_mut() {
        Some(Backend::WinRt(t)) => Ok(t),
        // 已选定 SAPI5 后不可能走到这里——probe 在选定后端后直接复用，不再调本函数。
        #[cfg(windows)]
        Some(Backend::Sapi(_)) => Err("引擎已切到 SAPI5".to_string()),
        None => unreachable!("上一行刚建过引擎"),
    }
}

/// 取（必要时建立）引擎，并按需选中英文音色。返回可用性与其原因。
///
/// 两条路：先 WinRT（`AllVoices`，只读 OneCore hive），拿不到英文音色就回退 SAPI5
/// （读旧 Speech hive，见 sapi.rs 的模块注释）。回退不改变门控方向——两条都不行才判不可用。
/// 非 Windows 上没有 SAPI5 这条回退（`sapi` 模块按 target 门掉），那一步定生死。
fn probe(engine: &mut Option<Backend>) -> VoiceProbe {
    // 已经选定过后端就直接复用——但复用的是**引擎**，不是上次的结论。
    // （引擎可能是 speak 抢先用默认音色建好的，故这里必须重新问一次「有没有英文音色」，
    //   见 winrt_english_voice_available 的注释。）
    if let Some(b) = engine.as_mut() {
        return match b {
            Backend::WinRt(t) => winrt_english_voice_available(t),
            #[cfg(windows)]
            Backend::Sapi(w) => match w.list_english_voices() {
                Ok(v) if !v.is_empty() => VoiceProbe::available("sapi", Some(v[0].1.clone())),
                Ok(_) => VoiceProbe::unavailable("SAPI5 音色里没有英文音色"),
                Err(e) => VoiceProbe::unavailable(format!("SAPI5 枚举失败：{e}")),
            },
        };
    }

    // WinRT 优先
    match winrt_engine(engine) {
        Ok(t) => match english_voice(t) {
            Ok(Some(v)) => {
                eprintln!("[tts] winrt english voice selected: {} ({})", v.name(), v.language());
                return VoiceProbe::available(BACKEND_LABEL, Some(v.name().to_string()));
            }
            Ok(None) => {
                eprintln!("[tts] winrt has no english voice; falling back to sapi5");
            }
            Err(e) => {
                eprintln!("[tts] winrt could not select an english voice: {e}");
            }
        },
        Err(e) => {
            eprintln!("[tts] could not construct winrt engine: {e}");
        }
    }

    // 回退 SAPI5（失败即换后端，已建立的 WinRT 实例作废）
    #[cfg(windows)]
    {
        match sapi::SapiWorker::spawn() {
            Ok(w) => match w.list_english_voices() {
                Ok(v) if !v.is_empty() => {
                    eprintln!("[tts] sapi5 english voice selected: {}", v[0].1);
                    let out = VoiceProbe::available("sapi", Some(v[0].1.clone()));
                    *engine = Some(Backend::Sapi(w));
                    out
                }
                Ok(_) => VoiceProbe::unavailable(format!(
                    "WinRT 与 SAPI5 里都没有英文音色；{}",
                    no_english_voice_reason()
                )),
                Err(e) => VoiceProbe::unavailable(format!("SAPI5 枚举失败：{e}")),
            },
            Err(e) => VoiceProbe::unavailable(format!("SAPI5 线程起不来：{e}")),
        }
    }
    // 非 Windows 没有回退臂：WinRT/原生那步没找到英文音色就直接判不可用，门控方向不变。
    #[cfg(not(windows))]
    VoiceProbe::unavailable(no_english_voice_reason())
}

/// 探测并选定英文音色。**任何失败一律返回 available=false**，不向上抛错
/// （保守：听辨题下线好过用中文音色读英文）。
#[tauri::command]
pub fn tts_english_voice_available() -> Result<VoiceProbe, String> {
    let Ok(mut guard) = ENGINE.lock() else {
        eprintln!("[tts] engine mutex poisoned; treating as no english voice");
        return Ok(VoiceProbe::unavailable("内部状态异常（锁中毒）"));
    };
    Ok(probe(&mut guard))
}

/// 朗读一段文本。rate 缺省 1.0（正常语速）。
///
/// WinRT 走单例上已选中的音色（探测时 set_voice 过，见 `english_voice` 的注释）；
/// SAPI5 走工作线程，音色在枚举时已记下。
#[tauri::command]
pub fn speak(text: String, rate: Option<f32>) -> Result<(), String> {
    let mut guard = ENGINE.lock().map_err(|e| e.to_string())?;
    let engine = match guard.as_mut() {
        Some(e) => e,
        None => {
            // 探测没跑过（或跑失败）：建 WinRT 用后端默认音色。
            // 这种机器上听辨题本就不在线，此处只求不 panic。
            let t = Tts::default().map_err(|e| e.to_string())?;
            guard.insert(Backend::WinRt(t))
        }
    };
    match engine {
        #[cfg(windows)]
        Backend::Sapi(w) => w.speak(text),
        Backend::WinRt(t) => {
            if let Some(r) = rate {
                // tts 的 set_rate 越界是**报错**不钳制（lib.rs:421-422），直接透传会让
                // 越界的 rate 变成「点了没声音」。这里先按后端自己的 min/max 夹住
                // （不硬编码常量，WinRT 为 0.5..=6.0），再调，永远不落进 Err 分支。
                let (min, max) = (t.min_rate(), t.max_rate());
                t.set_rate(r.clamp(min, max)).map_err(|e| e.to_string())?;
            }
            // 先停旧播放再读新的：连续出题时不叠读。stop 清空整个待播队列
            // （winrt.rs:213-233），故随后 interrupt=false 入队即从头播。
            // SAPI 侧没有 stop，engine 级不变式由 Speak 的 SPF_PURGEBEFORESPEAK 守住
            // （见 sapi.rs 的 speak_on_this_thread）。
            let _ = t.stop();
            // 丢弃 UtteranceId：前端不关心单次播报的句柄，只要「已受理」。
            t.speak(text, false).map(|_| ()).map_err(|e| e.to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::is_english_voice;

    #[test]
    fn accepts_common_english_language_tags() {
        for tag in ["en-US", "en-GB", "en_US", "en", "EN-us"] {
            assert!(is_english_voice(tag), "{tag} should count as english");
        }
    }

    #[test]
    fn rejects_non_english_language_tags() {
        for tag in ["zh-CN", "ja-JP", "de-DE", "", "fr"] {
            assert!(!is_english_voice(tag), "{tag} should not count as english");
        }
    }
}
