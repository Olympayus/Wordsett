//! 手机端的 TTS 占位实现（Android / iOS）。
//!
//! 为什么不能直接编 `tts` crate：它的 Android 后端要求两样本仓库没有的东西——
//! `rs/tts/Bridge` 这个 Java 类（`JNI_OnLoad` 里 `find_class` 找不到就 panic）与
//! `ndk_context` 的初始化（`Android::new()` 直接 `android_context().expect(...)`，
//! 而本仓库锁定的 tao 0.35 走 `ndk_glue`、从不初始化它）。panic 跨 FFI 边界是 abort，
//! 而前端在**所有平台**挂载时都会探测一次，于是手机一启动就崩。
//!
//! 故 `Cargo.toml` 里 `tts` 只在非手机目标编进来，`lib.rs` 在手机上把
//! `tts_player` 别名到这个模块。命令表因此两份逐字相同，前端契约（`VoiceProbe` /
//! `VoiceInfo` 的 camelCase 字段）也不变：探测报不可用，听辨题与发音按钮按既有
//! fail-closed 判据下线。Android 真正的 TTS 后端归 Plan 3。
//!
//! `speak` 返回 `Err` 而不是 `Ok(())`：探测已说不可用，走到这里的调用是前端漏判，
//! 让它在控制台里显式失败，比假装播过要好。

/// 音色枚举项。字段形状与桌面版逐字一致（前端契约）。
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceInfo {
    #[allow(dead_code)]
    name: String,
    #[allow(dead_code)]
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

#[tauri::command]
pub fn tts_english_voice_available() -> Result<VoiceProbe, String> {
    Ok(VoiceProbe {
        available: false,
        backend: None,
        voice: None,
        reason: Some("本平台暂未接入系统 TTS（Plan 3）".to_string()),
    })
}

#[tauri::command]
pub fn list_english_voices() -> Result<Vec<VoiceInfo>, String> {
    Ok(Vec::new())
}

#[tauri::command]
pub fn speak(_text: String, _rate: Option<f32>, _voice: Option<String>) -> Result<(), String> {
    Err("本平台暂未接入系统 TTS（Plan 3）".to_string())
}
