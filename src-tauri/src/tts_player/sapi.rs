//! SAPI5（旧 Speech API）回退后端（spec §6.3）。
//!
//! 存在理由：WinRT 的 `SpeechSynthesizer::AllVoices()` 只读
//! `HKLM\SOFTWARE\Microsoft\Speech_OneCore\Voices\Tokens`，而系统自带的英文音色
//! （`TTS_MS_EN-US_ZIRA_11.0`）注册在旧 SAPI5 的
//! `HKLM\SOFTWARE\Microsoft\Speech\Voices\Tokens` 下，WinRT 看不到。
//!
//! **线程模型**：`SpVoice` 是单元线程（apartment）COM 对象，必须始终从创建它的那个单元调用。
//! Tauri 的 command handler 跑在线程池上，不保证同线程，故本模块自带一个专属工作线程：
//! 线程内 `CoInitializeEx` 一次，之后所有 COM 调用都只在该线程发生，外部经 mpsc 投递请求。
//! 这与 winrt 后端不同——那里能用 `static Mutex<Option<Tts>>` 是因为
//! `SpeechSynthesizer` 是 agile 的，SAPI 没这个性质。
//!
//! 本模块整体在本步是「已备好、尚未接线」：枚举与朗读要到下一步才接上后端分发，
//! 故下面每个对外项都会触发 dead_code。**Task 2 接完线就删掉这一行。**
#![allow(dead_code)]

/// SAPI5 音色类别的注册表路径。`ISpObjectTokenCategory::SetId` 收的就是这个字符串。
pub const SAPI_VOICES_CATEGORY: &str =
    r"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech\Voices";

/// token id 是否带英文语言。SAPI5 的 token id 形如
/// `HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech\Voices\Tokens\TTS_MS_EN-US_ZIRA_11.0`，
/// 语言码是 `EN-US` 这样的片段；容错匹配 `en` / `en-US` / `en_GB` / `EN-us`，与
/// `tts_player::is_english_voice` 的口径一致（两条回退路径不应给出不同的「算不算英文」）。
///
/// 判定方式：用分隔符（`\` / `_` / `-` / 串首尾）把语言码切出来再比对，不能用裸
/// `contains("en")`——那样 `GREEN` / `KAREN` / `HEDDA` 都会误判为英文。
pub fn token_has_english_language(id: &str) -> bool {
    let lower = id.to_ascii_lowercase();
    let bytes = lower.as_bytes();
    let mut i = 0;
    while let Some(pos) = lower[i..].find("en") {
        let start = i + pos;
        let end = start + 2;
        let before_ok = start == 0 || !bytes[start - 1].is_ascii_alphanumeric();
        let after_ok = end == bytes.len() || !bytes[end].is_ascii_alphanumeric();
        if before_ok && after_ok {
            return true;
        }
        i = start + 1;
    }
    false
}

use std::sync::mpsc::{self, Sender};

/// 投给工作线程的请求。带 `reply` 的请求要等结果，`Speak` 不等（「已受理」语义，
/// 与 `tts_player::speak` 一致）。
enum Cmd {
    /// 建立引擎。`reply` 回 `Ok(())` 或失败原因文本。
    Init(Sender<Result<(), String>>),
    /// 枚举英文音色，回 `Vec<(token_id, 显示名)>`。
    ListEnglish(Sender<Result<Vec<(String, String)>, String>>),
    /// 朗读。不等结果。
    Speak(String),
}

/// SAPI5 工作线程的句柄。所有 COM 调用都发生在它自己那条线程上。
pub struct SapiWorker {
    tx: Sender<Cmd>,
}

impl SapiWorker {
    /// 起一条专属线程并让它在**线程内**初始化 COM。
    /// 失败只可能来自线程起不来或 `CoInitializeEx` 失败，两者都返回原因文本。
    pub fn spawn() -> Result<Self, String> {
        let (tx, rx) = mpsc::channel::<Cmd>();
        let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
        std::thread::Builder::new()
            .name("sapi-tts".into())
            .spawn(move || {
                // COM 只在这条线程初始化一次。APARTMENTTHREADED 是 SAPI 的单元模型要求；
                // 用 MULTITHREADED 会让 SpVoice 在被 marshal 时行为不确定。
                let init = unsafe {
                    windows::Win32::System::Com::CoInitializeEx(
                        None,
                        windows::Win32::System::Com::COINIT_APARTMENTTHREADED,
                    )
                };
                if init.is_err() {
                    let _ = ready_tx.send(Err(format!("CoInitializeEx 失败：{init:?}")));
                    return;
                }
                let _ = ready_tx.send(Ok(()));
                while let Ok(cmd) = rx.recv() {
                    match cmd {
                        Cmd::Init(reply) => { let _ = reply.send(Ok(())); }
                        Cmd::ListEnglish(reply) => { let _ = reply.send(Err("尚未实现".into())); }
                        Cmd::Speak(_text) => { /* 尚未实现 */ }
                    }
                }
                unsafe { windows::Win32::System::Com::CoUninitialize() };
            })
            .map_err(|e| format!("起 SAPI 线程失败：{e}"))?;
        ready_rx
            .recv()
            .map_err(|e| format!("SAPI 线程未回报：{e}"))??;
        Ok(Self { tx })
    }

    /// 朗读一段文本。不等发声完成——与 WinRT 后端同为「已受理」语义。
    pub fn speak(&self, text: String) -> Result<(), String> {
        self.tx.send(Cmd::Speak(text)).map_err(|_| "SAPI 线程已退出".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::token_has_english_language;
    use super::SAPI_VOICES_CATEGORY;

    #[test]
    fn category_path_points_at_sapi5_not_onecore() {
        // 这条钉住「别把 OneCore 的路径抄进来」——抄错会让回退后端枚举到与 WinRT 相同的那三个中文音色，
        // 于是「回退」永远找不到英文，且症状是静默的（探测返回 false，与「机器上真没有」不可分辨）。
        assert!(SAPI_VOICES_CATEGORY.contains(r"Microsoft\Speech\Voices"));
        assert!(!SAPI_VOICES_CATEGORY.contains("OneCore"));
    }

    #[test]
    fn recognizes_english_token_ids() {
        for id in [
            r"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech\Voices\Tokens\TTS_MS_EN-US_ZIRA_11.0",
            r"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech\Voices\Tokens\TTS_MS_EN-GB_HAZEL_11.0",
            r"TTS_MS_en-us_zira_11.0",
        ] {
            assert!(token_has_english_language(id), "{id} 应算英文");
        }
    }

    #[test]
    fn rejects_non_english_token_ids() {
        for id in [
            r"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech\Voices\Tokens\TTS_MS_ZH-CN_HUIHUI_11.0",
            r"TTS_MS_JA-JP_HARUKA_11.0",
            "",
            "TTS_MS_DE-DE_HEDDA_11.0",
        ] {
            assert!(!token_has_english_language(id), "{id} 不应算英文");
        }
    }

    #[test]
    fn does_not_match_language_code_inside_a_word() {
        // 「EN」出现在无关词里不该误判。用分隔符包围的语言码才算数。
        assert!(!token_has_english_language("TTS_MS_GREEN_11.0"));
        assert!(!token_has_english_language("SAPI_VOICE_KAREN_11.0"));
    }
}
