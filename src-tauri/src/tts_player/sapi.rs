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
//! COM 返回的 `PWSTR` 由调用方用 `CoTaskMemFree` 释放。本模块在每个取值点都释放。

use std::sync::mpsc::{self, Sender};

use windows::core::PWSTR;
use windows::Win32::Media::Speech::ISpVoice;
use windows::Win32::System::Com::CoTaskMemFree;

/// SAPI5 音色类别的注册表路径。`ISpObjectToken::SetId` 的第一个参数收的就是这个字符串
/// （`speak_on_this_thread` 里选音色那次）。
pub const SAPI_VOICES_CATEGORY: &str =
    r"HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech\Voices";

/// token id 是否带英文语言。SAPI5 的 token id 形如
/// `HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech\Voices\Tokens\TTS_MS_EN-US_ZIRA_11.0`，
/// 语言码是 `EN-US` 这样的片段；容错匹配 `en` / `en-US` / `en_GB` / `EN-us`。
///
/// 判定方式：用分隔符（`\` / `_` / `-` / 串首尾）把语言码切出来再比对，不能用裸
/// `contains("en")`——那样 `GREEN` / `KAREN` / `HEDDA` 都会误判为英文。
///
/// 与 `tts_player::is_english_voice` 是一对**分工不同**的判定，不是同一口径的两种写法：
/// 那边收的是 BCP 47 语言**标签**（`en-US`、`zh-CN`），做的是**前缀**比对；这边收的是
/// SAPI5 的 **token id**（整条注册表路径），做的是**分隔符包围的子串**比对。两者在各自的
/// 输入域上给出一致的结论——这也是回退后端存在的意义；但输入域之外它们不等价，
/// 例如 `is_english_voice("de-DE-en")` 为 false 而本函数返回 true。
/// 另有一处**故意**不同：裸 `"en"`（无分隔符）在本函数下为 **true**——两侧的
/// bounds 检查把「串首」和「串尾」也当作合法分隔符，所以 `"en"` 这种整串就是一个
/// 语言码的输入会被收下。这是有意宽松的：真正的 token id 不会只有 `en`（真实形态是
/// `TTS_MS_<lang>_<name>_<ver>`），而把一个明显写着 `en` 的 token 判成非英文没有好处。
/// 「算不算英文」两边在**各自真实的输入域**上给出一致结论，这才是回退后端要的东西；
/// 但输入域之外它们不等价，别把两条判定「统一」成同一份实现——那边的前缀语义
/// （`de-DE-en` 判 false）搬过来会把 token id 里的路径片段也当语言码。
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

/// 把 COM 交回来的宽字符串指针转成 Rust `String`，并释放那块内存。
///
/// `ptr` 非空时返回解码结果（非法 UTF-16 退化为空串），空指针时返回 `fallback`。
/// 调用方无论成败都不必再管这块内存。
unsafe fn take_com_string(ptr: PWSTR, fallback: &str) -> String {
    if ptr.is_null() {
        return fallback.to_string();
    }
    let s = ptr.to_string().unwrap_or_default();
    CoTaskMemFree(Some(ptr.as_ptr() as *const core::ffi::c_void));
    s
}

/// 投给工作线程的请求。带 `reply` 的请求要等结果，`Speak` 不等（「已受理」语义，
/// 与 `tts_player::speak` 一致）。
enum Cmd {
    /// 枚举英文音色。回 `Vec<(token_id, 显示名)>`，并在挑中第一条时顺带记住它的
    /// token id（枚举即选中，与 winrt 那条的设计一致——见 `tts_player::english_voice`）。
    ListEnglish(Sender<Result<Vec<(String, String)>, String>>),
    /// 用指定 token id 朗读。`token_id` 为 None 时用线程记着的 `selected`
    /// （枚举没跑过时的兜底）。`rate` 已是 SAPI 刻度 -10..10。
    Speak {
        text: String,
        token_id: Option<String>,
        rate: i32,
    },
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
                // HRESULT 判成功只看 `>= 0`（S_FALSE 也算成功）：RPC_E_CHANGED_MODE
                // （0x80010106）会顺带把 apartment 切成 MTA，那样 SAPI 的单元语义就没了。
                if init.is_err() {
                    let _ = ready_tx.send(Err(format!("CoInitializeEx 失败：{init:?}")));
                    return;
                }
                let _ = ready_tx.send(Ok(()));
                // 选中的音色留在本线程上：SpVoice 只能从创建它的单元调用，
                // 故既不建在外部也不放回外部。
                let mut voice: Option<ISpVoice> = None;
                let mut selected: String = String::new();
                while let Ok(cmd) = rx.recv() {
                    match cmd {
                        Cmd::ListEnglish(reply) => {
                            match list_english_on_this_thread() {
                                Ok(voices) => {
                                    // 枚举即选中：记下第一条英文音色的 token id，
                                    // 之后每次 Speak 都由 speak_on_this_thread 选上它。
                                    selected = voices.first().map(|(id, _)| id.clone()).unwrap_or_default();
                                    let _ = reply.send(Ok(voices));
                                }
                                Err(e) => {
                                    let _ = reply.send(Err(e));
                                }
                            }
                        }
                        // 音色**可以**点名，但要由线程自己把名字反查成 token id：
                        // SpVoice 只能从创建它的单元调用，外部拿不到这条线程上的实例，
                        // 那条线程自己记着枚举结果，故映射也留在它那里。
                        Cmd::Speak { text, token_id, rate } => {
                            // 没点名音色就退回枚举时选中的那条；两者都空时
                            // speak_on_this_thread 会用系统默认音色，不因此让本次朗读失败。
                            let id = token_id.as_deref().unwrap_or(selected.as_str());
                            if let Err(e) = speak_on_this_thread(&mut voice, id, &text, rate) {
                                eprintln!("[tts] sapi5 speak failed: {e}");
                            }
                        }
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

    /// 枚举本机 SAPI5 音色并挑出英文的那些，回 `(token_id, 显示名)`。
    ///
    /// 在工作线程上同步执行并等结果（枚举是毫秒级的，且只在探测时跑一次）。
    /// **副作用**：线程内那条 `SpVoice` 在被用到时会按第一条英文音色建好；
    /// 探测跑过之后本实例即固定走 SAPI5，音色也就此定格。
    pub fn list_english_voices(&self) -> Result<Vec<(String, String)>, String> {
        let (reply_tx, reply_rx) = mpsc::channel();
        self.tx
            .send(Cmd::ListEnglish(reply_tx))
            .map_err(|_| "SAPI 线程已退出".to_string())?;
        reply_rx
            .recv()
            .map_err(|e| format!("SAPI 线程未回报枚举结果：{e}"))?
    }

    /// 朗读一段文本。不等发声完成——与 WinRT 后端同为「已受理」语义。
    pub fn speak(&self, text: String, token_id: Option<String>, rate: i32) -> Result<(), String> {
        self.tx
            .send(Cmd::Speak { text, token_id, rate })
            .map_err(|_| "SAPI 线程已退出".to_string())
    }
}

/// 在同一单元内枚举 SAPI5 音色并挑出英文的。
///
/// 只在本模块的工作线程内调用——`SpObjectTokenCategory` / `EnumTokens` 与 `SpVoice`
/// 同属单元线程对象。
fn list_english_on_this_thread() -> Result<Vec<(String, String)>, String> {
    use windows::core::HSTRING;
    use windows::Win32::Media::Speech::{
        ISpObjectToken, ISpObjectTokenCategory, SpObjectTokenCategory, SPCAT_VOICES,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};

    unsafe {
        let category: ISpObjectTokenCategory = CoCreateInstance(&SpObjectTokenCategory, None, CLSCTX_ALL)
            .map_err(|e| format!("建立音色类别失败：{e}"))?;
        // SPCAT_VOICES 已经是 PCWSTR，而 HSTRING 没有 From<PCWSTR>，故走
        // PCWSTR::to_hstring() 这条由宽串建 HSTRING 的路（windows-strings-0.1.0/src/pcwstr.rs:73）。
        category
            .SetId(&SPCAT_VOICES.to_hstring().map_err(|e| format!("转换类别 id 失败：{e}"))?, false)
            .map_err(|e| format!("设置类别 id 失败：{e}"))?;

        // windows 0.58 把 COM 的 [out] 返回值收进返回值里，没有 `&mut` 出参位。
        let tokens = category
            .EnumTokens(None, None)
            .map_err(|e| format!("枚举音色失败：{e}"))?;

        let mut out = Vec::new();
        // 每次只取一个：ISpObjectToken 不 Clone，取出即 move，取完就地判。
        let mut one: Option<ISpObjectToken> = None;
        loop {
            let mut fetched = 0u32;
            tokens
                .Next(1, &mut one, Some(&mut fetched))
                .map_err(|e| format!("取音色失败：{e}"))?;
            if fetched == 0 {
                break;
            }
            let Some(token) = one.take() else { break };

            let id = take_com_string(token.GetId().map_err(|e| format!("取音色 id 失败：{e}"))?, "");
            if !token_has_english_language(&id) {
                continue;
            }
            // SAPI5 的显示名存在 token 的默认字符串值（valuename 传空串即取它），
            // 取不到就退回 token id——诊断面要有个能显示的东西。
            let name = token
                .GetStringValue(&HSTRING::from(""))
                .map(|p| take_com_string(p, &id))
                .unwrap_or_else(|_| id.clone());
            out.push((id, name));
        }
        Ok(out)
    }
}

/// 在同一单元内建一个 `SpVoice` 并用指定音色朗读。`token_id` 为空时用系统默认音色。
fn speak_on_this_thread(
    voice: &mut Option<ISpVoice>,
    token_id: &str,
    text: &str,
    rate: i32,
) -> Result<(), String> {
    use windows::core::HSTRING;
    use windows::Win32::Media::Speech::{ISpObjectToken, SpObjectToken, SpVoice, SPF_ASYNC, SPF_PURGEBEFORESPEAK};
    use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};

    unsafe {
        if voice.is_none() {
            *voice = Some(
                CoCreateInstance(&SpVoice, None, CLSCTX_ALL)
                    .map_err(|e| format!("建立 SpVoice 失败：{e}"))?,
            );
        }
        let v = voice.as_ref().expect("上一行刚建好");

        if !token_id.is_empty() {
            // SpObjectToken 的 SetId 与类别的 SetId 不同名：token 要**三个**参数
            // （类别 id、token id、是否按需创建），少一个就选不上音色。
            let token: ISpObjectToken = CoCreateInstance(&SpObjectToken, None, CLSCTX_ALL)
                .map_err(|e| format!("建立音色 token 失败：{e}"))?;
            token
                .SetId(&HSTRING::from(SAPI_VOICES_CATEGORY), &HSTRING::from(token_id), false)
                .map_err(|e| format!("设置音色 token id 失败：{e}"))?;
            v.SetVoice(&token)
                .map_err(|e| format!("选中音色失败：{e}"))?;
        }
        // SetRate 与 SetVoice 同为 SpVoice 的会话级设置，必须在 Speak 之前设。
        // rate 已是 SAPI 刻度（0.5–2.0 → -5..10，见 tts_player::rate_to_sapi）。
        v.SetRate(rate).map_err(|e| format!("设置语速失败：{e}"))?;
        // SPF_PURGEBEFORESPEAK 是 engine 级不变式的 SAPI 侧对应物（见 tts_player.rs 顶部）：
        // 连续点「播放读音」时先清空待播队列，否则上一个词会排在这次前面，两条音轨叠着念。
        // WinRT 侧靠 `let _ = t.stop()` 达成同一效果，这里没有 stop 可调，只能靠这个 flag。
        // 第三参 None = 不要 stream number（SPF_IS_FILENAME 未置，本就是纯文本）。
        //
        // 这个 HRESULT 是整条 SAPI 路径**唯一**能告诉我们「到底有没有排上」的信号：
        // Speak 不等结果，故下面的 Err 不会外抛到命令（`speak` 是「已受理」语义），
        // 但它必须留下来——否则「点了没声音」在诊断面上是无声的。`SPF_PURGEBEFORESPEAK`
        // 正是为避免播放中重入而设，所以这里期望它成功；真失败时打一行，
        // 让用户的出声验收至少能指出是 COM 这一层出的问题。
        if let Err(e) = v.Speak(
            &HSTRING::from(text),
            (SPF_ASYNC.0 | SPF_PURGEBEFORESPEAK.0) as u32,
            None,
        ) {
            eprintln!("[tts] sapi5 Speak failed: {e}");
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{token_has_english_language, SAPI_VOICES_CATEGORY};

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
        // 「en」是唯一能同时踩中首部与尾部两个边界保护的输入：左边没有前一个字符可查
        // （start == 0），右边也没有后一个字符可查（end == len）。其余用例都被前后至少
        // 一侧的检查挡着，等于只覆盖了两个保护中的一个。
        assert!(token_has_english_language("en"));
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
