//! iOS TTS（Task 14）：Swift `AVSpeechSynthesizer` 桥 + Rust 轮询。
//!
//! 为什么不是 `tts` crate：它的 iOS 后端能力不确定，且本仓库已因 Android 侧的
//! `rs/tts/Bridge` / `ndk_context` 问题整条排除该 crate（见 `tts_stub.rs` 文件头）。
//! 这里经 C ABI 调 Swift 的 `TtsBridge.swift`（Task 15，`src-tauri/gen/apple/` 内），
//! 五个 `@_cdecl` 符号与 `tts_android.rs` / `tts_bridge.rs` 的 JSON 契约一一对应。
//!
//! **不变量（任何改动都不得违反）**：
//! 1. **`AVSpeechSynthesizer` 只在主队列创建 / 朗读**（Swift 侧保证）。Rust 的 FFI
//!    调用只投递、不等待朗读结束——否则一次朗读会把 IPC 线程按在 AVFoundation 上。
//! 2. 探测在 **IPC 线程**上轮询：先读一次 `wordsett_tts_status`（同时触发 Swift 侧
//!    惰性初始化），`initializing` 时每 `PROBE_POLL_INTERVAL`（60ms）读一次，硬上限
//!    `PROBE_TIMEOUT`（5s）；超时返回 `available:false` + 原因「系统语音初始化超时」。
//! 3. `speak` 在状态非 ready 时由 Swift 返回非 0，本模块立刻翻成 `Err`（前端的
//!    `speakWord` 会吞掉），**绝不排队、绝不等待初始化**。
//! 4. `VoiceProbe` / `VoiceInfo` 的字段形状与桌面版逐字一致（前端契约）；
//!    `tts_english_voice_available` 永不抛错（任何失败一律 `available:false`）。
//! 5. Swift 不读配置文件：语速在 `rate == None` 时由本模块从 `config.rs` 解析、
//!    经 `tts_bridge::av_rate` 映射后传入；音色同理回退到 `tts.voice`。
//!
//! **内存所有权**：Swift 用 `strdup` 交出字符串，Rust 读完必须立刻经
//! `wordsett_tts_free` 释放——分配在 Swift 侧，释放也必须走 Swift 导出的 `free`，
//! 跨模块用错分配器是未定义行为。

use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::time::{Duration, Instant};

/// 探测轮询间隔。Swift 的初始化通常几十毫秒内完成，60ms 一次在 5 秒内留足余量。
const PROBE_POLL_INTERVAL: Duration = Duration::from_millis(60);

/// 探测硬上限。超出即「系统语音初始化超时」。
const PROBE_TIMEOUT: Duration = Duration::from_secs(5);

const PROBE_TIMEOUT_REASON: &str = "系统语音初始化超时";

// Swift 侧 `TtsBridge.swift` 导出的 C ABI（Task 15）。
//
// 符号名与 Swift 的 `@_cdecl` 逐字对齐，不需要 `#[link_name]`。任何一方改名都是
// 链接期失败，不会静默降级。
extern "C" {
    /// `{"state":"ready|initializing|unavailable","available":bool,"reason":string|null}`
    fn wordsett_tts_status() -> *mut c_char;
    /// `[{"name":string,"language":string|null}]`（只含英文音色）
    fn wordsett_tts_voices() -> *mut c_char;
    /// 0 = 已投递；非 0 = 未就绪 / 未投递。`voice_id` 为空指针时用系统默认音色。
    fn wordsett_tts_speak(text: *const c_char, rate: f32, voice_id: *const c_char) -> i32;
    /// 停止当前朗读。**Rust 侧没有对应的 `tts_stop` 命令**（前端契约里没有），
    /// 但契约要求声明这个符号；Swift 的 `speak` 实现自行处理打断。
    #[allow(dead_code)]
    fn wordsett_tts_stop();
    /// 释放 Swift `strdup` 出来的字符串。**必须**用它而不是 Rust 的 allocator。
    fn wordsett_tts_free(ptr: *mut c_char);
}

/// 音色枚举项。字段形状与桌面版逐字一致（前端契约）。
///
/// `name` 是 `AVSpeechSynthesisVoice.identifier`（spec §7.6）——设置页把它存进
/// `tts.voice`，`speak` 再原样传回 Swift。
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceInfo {
    name: String,
    /// 语言为 BCP-47。Swift 侧总会写这个键（可为 null），`default` 只是容忍缺省。
    #[serde(default)]
    language: Option<String>,
}

/// 探测结果。字段形状与桌面版逐字一致（前端契约）。
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceProbe {
    available: bool,
    backend: Option<String>,
    voice: Option<String>,
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

    /// 就绪态：`backend` 固定为 `"ios"`（前端用它显示「探测到了什么」）。
    fn ios() -> Self {
        Self {
            available: true,
            backend: Some("ios".to_string()),
            voice: None,
            reason: None,
        }
    }
}

/// 探测系统是否有可用的英文语音。
///
/// 与桌面/Android 同一条 fail-closed 原则：**永不向上抛错**，任何失败都折成
/// `available:false` 加原因，前端据此把听辨题与发音按钮下线。
#[tauri::command]
pub fn tts_english_voice_available() -> Result<VoiceProbe, String> {
    Ok(probe())
}

/// 枚举英文音色（iPad 的设置页用；iPhone 不渲染下拉，但仍可被诊断调用）。
///
/// 与 Android 的 list 同一条 fail-closed：桥返回空指针或 JSON 解析失败时退回空表，
/// 设置页只剩「系统默认」，不把整个分区打成错误态。
#[tauri::command]
pub fn list_english_voices() -> Result<Vec<VoiceInfo>, String> {
    // SAFETY: `wordsett_tts_voices` 返回 Swift `strdup` 的 NUL 结尾字符串或空指针；
    // `take_string` 会在转换后立即释放。
    let Some(raw) = take_string(unsafe { wordsett_tts_voices() }) else {
        return Ok(Vec::new());
    };

    match serde_json::from_str::<Vec<VoiceInfo>>(&raw) {
        Ok(voices) => Ok(voices),
        Err(e) => {
            eprintln!("[tts] voices JSON 无法解析：{e}");
            Ok(Vec::new())
        }
    }
}

/// 朗读一段文本。
///
/// `rate` 省略时从 `shortcuts.json` 现读一次，再经 `av_rate` 映射到
/// `AVSpeechUtteranceRate`；`voice` 省略时同样回退到 `tts.voice`（iPad 的音色下拉
/// 写的就是它），仍为 `None` 才传空指针 = 系统默认英文音色。
///
/// 状态非 ready 时 Swift 的 `speak` 只回非 0、不朗读，本函数把它翻成 `Err`。
/// 这条路径**不等待初始化**：探测失败后前端仍可能因缓存状态点一次发音，
/// 让它立刻失败比把 IPC 线程按在 5 秒的初始化路径上要好。
#[tauri::command]
pub fn speak(text: String, rate: Option<f32>, voice: Option<String>) -> Result<(), String> {
    let cfg = crate::config::get();
    let rate = rate.unwrap_or_else(|| crate::config::f32_at(&cfg, "tts.rate", 1.0));
    let voice = voice.or_else(|| crate::config::str_at(&cfg, "tts.voice"));

    // C 字符串不能含内部 NUL：宁可按参数错误返回，也不截断文本。
    let text = CString::new(text).map_err(|_| "朗读文本包含 NUL 字符".to_string())?;
    let voice = match voice {
        Some(name) => Some(CString::new(name).map_err(|_| "音色名包含 NUL 字符".to_string())?),
        None => None,
    };
    let voice_ptr = voice.as_ref().map_or(std::ptr::null(), |name| name.as_ptr());

    // SAFETY: 两个指针都指向本次调用期间存活的 `CString`；`rate` 已夹到 AV 的 0.0–1.0。
    let code =
        unsafe { wordsett_tts_speak(text.as_ptr(), crate::tts_bridge::av_rate(rate), voice_ptr) };
    if code == 0 {
        return Ok(());
    }

    // 非 0 = Swift 侧判定「未就绪 / 朗读未投递」。读一次状态取原因，取不到用通用文案。
    // 前端 `speakWord` 会吞掉 Err：这里只负责「不假装播过」。
    Err(read_status()
        .ok()
        .and_then(|found| found.reason)
        .unwrap_or_else(|| "系统语音尚未就绪".to_string()))
}

/// 一次状态读取的结论。
enum Status {
    Ready,
    Unavailable(String),
    Initializing,
}

/// 把 `BridgeProbe` 归类。`state == "ready"` 但 `available == false` 视为「还没好」，
/// 继续轮询——与 Android 的 `Ok(_) => {}` 同一条取舍。
fn classify(found: crate::tts_bridge::BridgeProbe) -> Status {
    if found.state == "ready" && found.available {
        Status::Ready
    } else if found.state == "unavailable" {
        Status::Unavailable(found.reason.unwrap_or_else(|| "系统语音不可用".to_string()))
    } else {
        Status::Initializing
    }
}

/// 探测实现。返回 `VoiceProbe` 而非 `Result`：命令契约要求失败也走 `Ok`。
///
/// 第一次读状态同时触发 Swift 侧惰性初始化；读失败（空指针 / JSON 损坏）说明桥本身
/// 坏了，重试没有意义，立刻如实报因。之后 `initializing` 时每 60ms 轮询，总预算 5 秒。
fn probe() -> VoiceProbe {
    let started = Instant::now();

    match read_status() {
        Ok(found) => match classify(found) {
            Status::Ready => return VoiceProbe::ios(),
            Status::Unavailable(reason) => return VoiceProbe::unavailable(reason),
            Status::Initializing => {}
        },
        Err(e) => return VoiceProbe::unavailable(e),
    }

    loop {
        let elapsed = started.elapsed();
        if elapsed >= PROBE_TIMEOUT {
            break;
        }
        std::thread::sleep(PROBE_POLL_INTERVAL.min(PROBE_TIMEOUT - elapsed));

        match read_status() {
            Ok(found) => match classify(found) {
                Status::Ready => return VoiceProbe::ios(),
                Status::Unavailable(reason) => return VoiceProbe::unavailable(reason),
                Status::Initializing => {}
            },
            // 单次读失败（桥忙 / 瞬时无响应）不立刻判死：只要预算还在就再试。
            Err(e) => eprintln!("[tts] 读取 TTS 状态失败：{e}"),
        }
    }

    VoiceProbe::unavailable(PROBE_TIMEOUT_REASON)
}

/// 读一次 `wordsett_tts_status()` 并解析。
fn read_status() -> Result<crate::tts_bridge::BridgeProbe, String> {
    // SAFETY: 返回 Swift `strdup` 的 NUL 结尾字符串或空指针；`take_string` 负责释放。
    let ptr = unsafe { wordsett_tts_status() };
    let raw = take_string(ptr).ok_or_else(|| "TTS 桥未返回状态".to_string())?;
    crate::tts_bridge::probe_from_json(&raw)
}

/// 接管 Swift `strdup` 出来的 C 字符串：转成 Rust `String` 后立刻交还
/// `wordsett_tts_free`。空指针返回 `None`。
fn take_string(ptr: *mut c_char) -> Option<String> {
    if ptr.is_null() {
        return None;
    }

    // SAFETY: 契约要求非空指针指向 Swift `strdup` 的 NUL 结尾字符串，且在本次
    // `wordsett_tts_free` 之前保持有效；调用期间无人释放它。
    let text = unsafe { CStr::from_ptr(ptr) }.to_string_lossy().into_owned();
    // SAFETY: 指针来自 `wordsett_tts_status` / `wordsett_tts_voices`，按契约只释放一次。
    unsafe { wordsett_tts_free(ptr) };
    Some(text)
}
