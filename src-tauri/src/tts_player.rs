//! 系统级离线 TTS（spec §5.3、00 篇 §3.2）。
//!
//! 全局单一实例：新播放先 stop 旧播放，避免连续出题时两条音轨叠读。
//! 探测命令单独暴露，供前端在启动时决定听辨题型是否上线。

use std::sync::Mutex;
use tts::Tts;

/// 全局单例。Tts 不是 Send 友好的并发对象，用 Mutex 串行化全部访问。
///
/// tts 0.26 内部是 `Rc<RwLock<..>>` 却用 `unsafe impl Send/Sync` 放行
/// （tts-0.26.3/src/lib.rs:262-266），本文件能放进 static 正是靠这两个 impl。
/// 真实约束靠「不注册任何 utterance 回调」守住：回调由 WinRT 事件线程触发、
/// 闭包不受 Send 约束，一旦注册就可能绕过这把锁。同步的 speak/stop/voices
/// 全部经此锁串行，不与事件线程并发触碰同一实例。
static ENGINE: Mutex<Option<Tts>> = Mutex::new(None);

/// 语言标识是否算英文。容错匹配：`en` / `en-US` / `en_GB` / `EN-us` 都收。
///
/// 泛型收 `AsRef<str>`：单测传 `&str`，探测命令直接传 `Voice::language()`
/// 返回的 `LanguageTag<String>`（其 `AsRef<str>` 转发到内部 tag，
/// 见 oxilangtag-0.1.6/src/lib.rs:391），无需手工 `as_str()`。
pub fn is_english_voice<L: AsRef<str>>(language: L) -> bool {
    let l = language.as_ref().trim().to_ascii_lowercase();
    l == "en" || l.starts_with("en-") || l.starts_with("en_")
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

/// 系统里是否存在英文音色。**任何失败一律返回 false**，不向上抛错
/// （保守：听辨题下线好过用中文音色读英文）。
#[tauri::command]
pub fn tts_english_voice_available() -> Result<bool, String> {
    // 锁中毒 / 建引擎失败 / 枚举失败 / 选中失败，都归为「不可用」——前端拿到的永远是
    // 一个可信的 bool，不会因为 Err 走上另一条分支。但「这台机器没有英文音色」和
    // 「引擎根本建不起来」对用户是两回事，诊断行让它们在日志里可分（item 5）。
    let Ok(mut guard) = ENGINE.lock() else {
        eprintln!("[tts] engine mutex poisoned; treating as no english voice");
        return Ok(false);
    };
    let engine = match guard.as_mut() {
        Some(e) => e,
        None => match Tts::default() {
            Ok(e) => guard.insert(e),
            Err(e) => {
                eprintln!("[tts] could not construct engine: {e}");
                return Ok(false);
            }
        },
    };
    // voices() 取 &self，不可变借用即可；选中需要 &mut，故 english_voice 收 &mut Tts。
    match english_voice(engine) {
        Ok(Some(v)) => {
            eprintln!("[tts] english voice selected: {} ({})", v.name(), v.language());
            Ok(true)
        }
        Ok(None) => Ok(false),
        Err(e) => {
            eprintln!("[tts] could not select an english voice: {e}");
            Ok(false)
        }
    }
}

/// 朗读一段文本。rate 缺省 1.0（正常语速）。
///
/// 用的是单例上**已选中的音色**——`tts_english_voice_available` 选中英文音色后
/// 一直留在 ENGINE 里，这里不再逐次 set_voice（逐次重选反而会让一次播放与下一次
/// 之间出现音色漂移）。探测没跑过或没找到英文音色时，这里就是后端默认音色，
/// 但那种机器上听辨题本就不在线。
#[tauri::command]
pub fn speak(text: String, rate: Option<f32>) -> Result<(), String> {
    let mut guard = ENGINE.lock().map_err(|e| e.to_string())?;
    let engine = match guard.as_mut() {
        Some(e) => e,
        None => {
            let e = Tts::default().map_err(|e| e.to_string())?;
            guard.insert(e)
        }
    };
    if let Some(r) = rate {
        // tts 的 set_rate 越界是**报错**不钳制（lib.rs:421-422），直接透传会让
        // 越界的 rate 变成「点了没声音」。这里先按后端自己的 min/max 夹住
        // （不硬编码常量，WinRT 为 0.5..=6.0），再调，永远不落进 Err 分支。
        let (min, max) = (engine.min_rate(), engine.max_rate());
        engine.set_rate(r.clamp(min, max)).map_err(|e| e.to_string())?;
    }
    // 先停旧播放再读新的：连续出题时不叠读。stop 清空整个待播队列
    // （winrt.rs:213-233），故随后 interrupt=false 入队即从头播。
    let _ = engine.stop();
    // 丢弃 UtteranceId：前端不关心单次播报的句柄，只要「已受理」。
    engine.speak(text, false).map(|_| ()).map_err(|e| e.to_string())
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
