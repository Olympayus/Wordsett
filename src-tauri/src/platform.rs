//! 平台与系统权限状态。
//!
//! 一个命令同时回答两个问题：「本机是不是 macOS」和「辅助功能授权了没有」。
//! 这样前端不必引入 `@tauri-apps/plugin-os` 就能做 mac 专属的条件渲染
//! （设计 §3 D10）。
//!
//! **这个权限唯一服务的是「向其他应用发送合成键盘事件」**——即 v0.8.0 划-3 的
//! 模拟复制抓词。剪贴板监听、deep link、托盘、TTS 都不需要它。
//! 没授权时的表现很难查：热键按得下、代码不报错，但合成的 Cmd+C 被系统静默丢弃，
//! 用户看到的是「抓词没反应」。设置页把这个状态显示出来，就是为了让这种情况可诊断。

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    /// 进程是否被授予辅助功能信任。返回非 0 表示已授权。
    /// 该状态在**进程启动时**求值，用户在系统设置里勾选后通常要重启应用才生效。
    fn AXIsProcessTrusted() -> bool;
}

/// 平台权限状态。**前端契约，字段名不可变**（camelCase，与 lib.rs 的 NextState 同款约束）。
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformStatus {
    /// 本机是否存在「辅助功能授权」这个概念。仅 macOS 为 true；
    /// 前端据此决定整个「平台权限」分区渲不渲染。
    supported: bool,
    /// 是否已授权。`supported == false` 时恒 false，前端不应读它。
    granted: bool,
}

#[tauri::command]
pub fn accessibility_status() -> PlatformStatus {
    #[cfg(target_os = "macos")]
    {
        PlatformStatus { supported: true, granted: unsafe { AXIsProcessTrusted() } }
    }
    #[cfg(not(target_os = "macos"))]
    {
        PlatformStatus { supported: false, granted: false }
    }
}

/// macOS「前往系统设置」按钮：深链到 隐私与安全性 → 辅助功能。
///
/// 走自定义命令而不是让前端直接调 opener 插件，与 lib.rs 的 `open_data_dir` 同一模式，
/// 权限面因此保持最小（应用自定义命令不需要 capabilities 条目）。
#[tauri::command]
pub fn open_accessibility_settings(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use tauri_plugin_opener::OpenerExt;
        app.opener()
            .open_url(
                "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
                None::<&str>,
            )
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Err("平台权限设置仅 macOS 可用".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::accessibility_status;

    /// Windows 分支必须恒报 supported=false——前端整段渲染的门就靠它。
    #[cfg(not(target_os = "macos"))]
    #[test]
    fn non_macos_reports_unsupported() {
        let s = accessibility_status();
        assert!(!s.supported);
        assert!(!s.granted);
    }

    /// 前端按 camelCase 读，漂移会让 `supported` 变 undefined、分区永远不渲染。
    #[test]
    fn serializes_camel_case_fields() {
        let v = serde_json::to_value(accessibility_status()).expect("必须可序列化");
        assert!(v["supported"].is_boolean(), "supported 缺失：{v}");
        assert!(v["granted"].is_boolean(), "granted 缺失：{v}");
    }
}