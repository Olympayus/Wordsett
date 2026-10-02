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

/// 音色枚举项。**前端契约**（camelCase）。
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceInfo {
    /// 显示名，如 `Microsoft Zira Desktop`。**也是 `shortcuts.json` 里 `tts.voice` 的取值**
    /// ——按名字而非 id 存，是因为 id 在两个后端里不是同一种东西（WinRT 是 token 串、
    /// SAPI5 是 registry token id），而显示名两处都有，且配置文件是给人看/给人改的。
    name: String,
    /// 语言标签。SAPI5 的枚举不回报语言（它按英文过滤后才交出来），故为 None。
    language: Option<String>,
}

/// 用户面向的语速 0.5–2.0（1.0 = 常速）→ SAPI 的 `SetRate` 刻度 -10..10（0 = 常速）。
/// 只取上半段，且越界静默夹住——rate 来自用户可直接编辑的配置文件。
pub fn rate_to_sapi(rate: f32) -> i32 {
    ((rate - 1.0) * 10.0).round().clamp(-10.0, 10.0) as i32
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
            // 两处缓存都要跟着引擎一起改，否则「系统默认」将无处可恢复：
            // PROBE_VOICE 是它要恢复到的目标，APPLIED_VOICE 则是 apply_voice 的快路径判据
            // ——不更新后者，下次朗读会拿旧名字走快路径、静默念错音色。
            if let Ok(mut a) = APPLIED_VOICE.lock() {
                *a = Some(v.name().to_string());
            }
            if let Ok(mut p) = PROBE_VOICE.lock() {
                *p = Some(v.name().to_string());
            }
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

/// 当前已应用到引擎上的音色显示名。用来避免每次朗读都重设一遍（`set_voice` 不便宜）。
static APPLIED_VOICE: Mutex<Option<String>> = Mutex::new(None);

/// 探测时选中的那条英文音色，即 `tts.voice = null`（「系统默认」）要恢复到的目标。
///
/// **与 `APPLIED_VOICE` 分开记，是因为两者会分叉**：用户从「系统默认」切到 Zira 时，
/// 引擎上是 Zira（`APPLIED_VOICE`），但「系统默认」该恢复到的仍是探测选中的那条
/// （`PROBE_VOICE`）。只留一份就分不清「引擎上是 Zira，因为探测选的就是它」和
/// 「引擎上是 Zira，因为用户点的就是它」——后者必须能被恢复回去。
static PROBE_VOICE: Mutex<Option<String>> = Mutex::new(None);

/// 用户选中的音色在系统里不存在时的**两个后端共用的**唯一原因文案。
///
/// 抽成一处是因为 spec §4.4 要求「失败 → 前端显示红字」，而红字只有一句时，
/// 两个后端各写一份就等于两条用户可分辨的文字——同一个故障看起来像两个问题。
/// 音色**已被系统卸载**是唯一能走到这里的场景，故措辞直接这么说。
fn voice_not_found(want: &str) -> String {
    format!("系统里找不到音色「{want}」，可能已被卸载")
}

/// `apply_voice` 每次朗读要做的判定。**纯函数**（spec §6.1）：只读三份状态，不碰引擎。
///
/// 之所以能纯：三个入参全部是已经取好的 `Option<&str>`，枚举与 `set_voice` 都在外面。
/// 抽出来的收益是把「要不要动引擎 / 动到哪条」这张决策表从副作用里剥出来，
/// 于是「连点两次系统默认不重复枚举」这类要求可以被钉住，而不是靠人读代码确认。
#[derive(PartialEq, Eq, Debug)]
enum VoiceAction {
    /// 不用动引擎：已经是目标音色，或压根没有可恢复的目标。
    NoChange,
    /// 把引擎切到这条音色。
    Apply(String),
}

/// `tts.voice` → 本次是否要动引擎、以及动到哪条。
///
/// `want` 是用户选中的显示名，`None` = 「系统默认」（spec §5.1）。
/// `applied` 是引擎上**实际**在用的，`probe` 是探测选中的那条（「系统默认」的恢复目标）。
fn voice_target(
    want: Option<&str>,
    applied: Option<&str>,
    probe: Option<&str>,
) -> VoiceAction {
    let target = match want {
        Some(w) => w,
        // 「系统默认」解析成探测选中的那条，而不是 OS 的默认嗓音：
        // zh-CN 机器上后者是用中文嗓音念英文，恰是探测要防的事。
        // 没有探测记录（探测没跑过 / 机器上没英文音色）就没有可恢复的目标，保持现状。
        None => match probe {
            Some(p) => p,
            None => return VoiceAction::NoChange,
        },
    };
    if applied == Some(target) {
        VoiceAction::NoChange
    } else {
        VoiceAction::Apply(target.to_string())
    }
}

/// 把用户选中的音色应用到 WinRT 引擎。
///
/// `want == None` 是「系统默认」（spec §5.1：`tts.voice = null`），**不是「不动引擎」**——
/// 设置页的「系统默认」选项把 `null` 持久化下来，用户从 Zira 切回它就必须真的切回去。
/// 恢复目标是 `english_voice` 选中的那条（`PROBE_VOICE`）。
///
/// **Review Focus 3**：点名了却查不到时返回 Err，而不是静默用别的音色——
/// 静默换音色会让「设置里选了 A、实际念的是 B」无从察觉。
fn apply_voice(engine: &mut Tts, want: Option<&str>) -> Result<(), String> {
    let (applied, probe) = (
        APPLIED_VOICE.lock().ok().and_then(|a| a.clone()),
        PROBE_VOICE.lock().ok().and_then(|p| p.clone()),
    );
    let target = match voice_target(want, applied.as_deref(), probe.as_deref()) {
        VoiceAction::NoChange => return Ok(()),
        VoiceAction::Apply(t) => t,
    };
    let voices = engine.voices().map_err(|e| e.to_string())?;
    let found = voices
        .into_iter()
        .find(|v| v.name() == target)
        .ok_or_else(|| voice_not_found(&target))?;
    engine.set_voice(&found).map_err(|e| e.to_string())?;
    if let Ok(mut a) = APPLIED_VOICE.lock() {
        *a = Some(target);
    }
    Ok(())
}

/// 在 SAPI5 的 `(token_id, 显示名)` 枚举里按显示名查 token id。**纯函数**（spec §6.1）。
///
/// 与 `apply_voice` 同一条规矩，只是换到 SAPI5 的输入域上：**点名了却查不到就报错**，
/// 不退回枚举时选中的那条——那条是另一个音色，静默换掉就是 Review Focus 3 要防的那件事
/// （spec §4.4「失败（音色被系统卸载）→ 回退系统默认 + 返回 Err」）。
/// 「调用方没点名」不是这条路径：那是 `None`，由工作线程按枚举时选中的音色处理。
#[cfg(windows)]
fn sapi_token_id(voices: &[(String, String)], want: &str) -> Result<String, String> {
    voices
        .iter()
        .find(|(_id, name)| name == want)
        .map(|(id, _)| id.clone())
        .ok_or_else(|| voice_not_found(want))
}

/// 枚举本机英文音色。数据源跟随**已选定的后端**（与 `probe` 同一分身法）：
/// SAPI5 已选定时走工作线程的枚举，否则走 WinRT/原生。
#[tauri::command]
pub fn list_english_voices() -> Result<Vec<VoiceInfo>, String> {
    let mut guard = ENGINE.lock().map_err(|_| "内部状态异常（锁中毒）".to_string())?;

    #[cfg(windows)]
    if let Some(Backend::Sapi(w)) = guard.as_ref() {
        return Ok(w
            .list_english_voices()?
            .into_iter()
            .map(|(_id, name)| VoiceInfo { name, language: None })
            .collect());
    }

    let t = winrt_engine(&mut guard)?;
    let voices = t.voices().map_err(|e| e.to_string())?;
    Ok(voices
        .into_iter()
        .filter(|v| is_english_voice(v.language()))
        .map(|v| VoiceInfo {
            name: v.name().to_string(),
            language: Some(v.language().to_string()),
        })
        .collect())
}

/// 朗读一段文本。
///
/// `rate` / `voice` 省略时取 `shortcuts.json` 的当前值——调用方因此不必重复传参，
/// 用户在设置页改完立刻生效（每次朗读都读一次配置，不做缓存失效逻辑）。
///
/// WinRT 走单例上已选中的音色（探测时 set_voice 过，见 `english_voice` 的注释）；
/// SAPI5 走工作线程，音色与语速随消息传下去。
#[tauri::command]
pub fn speak(text: String, rate: Option<f32>, voice: Option<String>) -> Result<(), String> {
    let cfg = crate::config::get();
    let voice = voice.or_else(|| crate::config::str_at(&cfg, "tts.voice"));
    let rate = rate.unwrap_or_else(|| crate::config::f32_at(&cfg, "tts.rate", 1.0));

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
        Backend::Sapi(w) => {
            // token id 由名字反查：SAPI 的 SpVoice 只能从创建它的单元调用，
            // 那条线程自己记着枚举结果，故由它来完成名字 → id 的映射。
            let token_id = match voice.as_deref() {
                Some(name) => Some(sapi_token_id(&w.list_english_voices()?, name)?),
                None => None,
            };
            w.speak(text, token_id, rate_to_sapi(rate))
        }
        Backend::WinRt(t) => {
            apply_voice(t, voice.as_deref())?;
            // tts 的 set_rate 越界是**报错**不钳制（lib.rs:421-422），直接透传会让
            // 越界的 rate 变成「点了没声音」。这里先按后端自己的 min/max 夹住
            // （不硬编码常量，WinRT 为 0.5..=6.0），再调，永远不落进 Err 分支。
            let (min, max) = (t.min_rate(), t.max_rate());
            t.set_rate(rate.clamp(min, max)).map_err(|e| e.to_string())?;
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
    use super::{is_english_voice, rate_to_sapi, voice_target, VoiceAction};

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

    /// 用户面向的语速是 0.5–2.0（1.0 = 常速），SAPI 的 SetRate 是 -10..10（0 = 常速）。
    /// 映射只取其上半段（0.5 → -5），避免把「稍慢」直接推到 SAPI 的最慢极端。
    #[test]
    fn rate_maps_onto_sapi_scale() {
        assert_eq!(rate_to_sapi(1.0), 0);
        assert_eq!(rate_to_sapi(1.5), 5);
        assert_eq!(rate_to_sapi(2.0), 10);
        assert_eq!(rate_to_sapi(0.5), -5);
        assert_eq!(rate_to_sapi(0.75), -3); // 四舍五入
    }

    /// 越界静默夹住，不 panic——rate 来自用户可手改的配置文件。
    #[test]
    fn rate_clamps_out_of_range() {
        assert_eq!(rate_to_sapi(9.0), 10);
        assert_eq!(rate_to_sapi(-3.0), -10);
        assert_eq!(rate_to_sapi(0.0), -10);
    }

    /// Review Focus 3 的 SAPI 侧：点名了音色就必须换成它，或明确报错——
    /// 绝不退回枚举时选中的那条（那正是「设置里选了 A、实际念的是 B」）。
    #[cfg(windows)]
    #[test]
    fn named_sapi_voice_resolves_to_its_own_token_id() {
        use super::sapi_token_id;

        let voices = vec![
            ("HKEY_LOCAL_MACHINE\\..\\ZIRA".to_string(), "Microsoft Zira Desktop".to_string()),
            ("HKEY_LOCAL_MACHINE\\..\\HAZEL".to_string(), "Microsoft Hazel Desktop".to_string()),
        ];
        // 点名谁就取谁的 id，不能总是取第一条（第一条是探测时选中的那条）。
        assert_eq!(
            sapi_token_id(&voices, "Microsoft Hazel Desktop").unwrap(),
            "HKEY_LOCAL_MACHINE\\..\\HAZEL"
        );
        assert_eq!(
            sapi_token_id(&voices, "Microsoft Zira Desktop").unwrap(),
            "HKEY_LOCAL_MACHINE\\..\\ZIRA"
        );
    }

    /// 查不到时必须 Err，且文案与 `apply_voice`（WinRT 侧）逐字相同——
    /// 同一个故障在两个后端上只该有一条用户可读的原因。
    #[cfg(windows)]
    #[test]
    fn missing_sapi_voice_errors_instead_of_falling_back() {
        use super::{sapi_token_id, voice_not_found};

        let voices = vec![("id-zira".to_string(), "Microsoft Zira Desktop".to_string())];
        let err = sapi_token_id(&voices, "已卸载的音色").unwrap_err();
        assert_eq!(err, voice_not_found("已卸载的音色"));
        assert_eq!(err, "系统里找不到音色「已卸载的音色」，可能已被卸载");

        // 空枚举同样报错，而不是「没找到就当没点名」。
        assert!(sapi_token_id(&[], "Microsoft Zira Desktop").is_err());
    }

    /// 初始状态不得退化：探测已选中 Zira、用户还没选过（applied==probe）时，
    /// 「系统默认」必须是空操作——每次朗读都不许重新枚举 + set_voice。
    #[test]
    fn default_voice_is_a_noop_before_any_user_choice() {
        assert_eq!(
            voice_target(None, Some("Zira"), Some("Zira")),
            VoiceAction::NoChange
        );
    }

    /// 用户从「系统默认」切到 Hazel：引擎上现在是探测选中的 Zira，必须真的动引擎。
    #[test]
    fn picking_a_voice_applies_it() {
        assert_eq!(
            voice_target(Some("Hazel"), Some("Zira"), Some("Zira")),
            VoiceAction::Apply("Hazel".to_string())
        );
    }

    /// 核心回归：选 Zira → 切回「系统默认」。必须把引擎切**回**探测选中的 Hazel，
    /// 早退（NoChange）会让设置里显示「系统默认」、实际仍念 Zira。
    #[test]
    fn reverting_to_default_restores_the_probe_pick() {
        assert_eq!(
            voice_target(None, Some("Zira"), Some("Hazel")),
            VoiceAction::Apply("Hazel".to_string())
        );
    }

    /// 恢复过一次之后再点「系统默认」必须是空操作——APPLIED_VOICE 这时候已等于探测选中的
    /// 那条，所以第二次不会再触发一次枚举。
    #[test]
    fn repeat_default_after_restore_stays_cheap() {
        assert_eq!(
            voice_target(None, Some("Hazel"), Some("Hazel")),
            VoiceAction::NoChange
        );
    }

    /// 「系统默认」→ 选 Zira → 再「系统默认」能恢复回去之后，用户又点了一次 Zira：
    /// 点名必须照旧生效，不能因为缓存里留着 Hazel 而被当成 NoChange。
    #[test]
    fn choosing_a_voice_still_reapplies_after_a_restore() {
        assert_eq!(
            voice_target(Some("Zira"), Some("Hazel"), Some("Hazel")),
            VoiceAction::Apply("Zira".to_string())
        );
    }

    /// 探测没跑过、或机器上根本没有英文音色时，没有可恢复的目标：保持引擎现状。
    /// 这不是 UI 能走到的状态（听辨题已 fail-closed 下线），故不报错。
    #[test]
    fn default_without_a_probe_pick_keeps_current_voice() {
        assert_eq!(voice_target(None, None, None), VoiceAction::NoChange);
        assert_eq!(
            voice_target(None, Some("Zira"), None),
            VoiceAction::NoChange
        );
    }
}
