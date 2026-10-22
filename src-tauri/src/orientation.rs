//! 屏幕方向（Task 10）：安卓上把窗口锁到竖屏 / 横屏。
//!
//! 前端只在**手机外壳挂载时**调一次 `set_screen_orientation`（`orientationFor` 说手机锁竖屏、
//! 平板锁横屏、桌面不锁）。桌面这条路径不存在——`MobileShell` 只在 `android-phone` 下挂载。
//!
//! 为什么写 Rust 而不是直接给 Activity 写 `android:screenOrientation`：锁方向与解锁方向走的是
//! 同一个命令（`setRequestedOrientation(UNSPECIFIED)`），而这个值**刻意不进 `tauri.conf.json`**——
//! 平板形态与手机形态是同一套 APK，Manifest 里只能写死一个。
//!
//! 实现走 Tauri/wry 自己那条 JNI 通道，而不是 `ndk-context`：后者的 `android_context()` 依赖
//! 有人在 `JNI_OnLoad` 时写入全局变量，而本仓库锁定的 tao 0.35 走的是 `ndk-glue`，**从不写**它
//! （`ndk_context::android_context()` 会直接 panic）。wry 0.55 的 `PlatformWebview::jni_handle()`
//! 是 Tauri 自己就在用的通道（`Webview::with_webview` 的文档示例即 `jni_handle().exec(...)`），
//! 它在主循环线程上给出 `JNIEnv` 与 Activity，故不需要任何额外的初始化。
//!
//! `orientation_value` 刻意**不带 android cfg**：它是这条命令唯一的判据，宿主机（Windows 上的
//! `cargo test`）要能直接跑它——安卓专用测试在本环境永远跑不起来，等于没有测试。

/// `Activity.SCREEN_ORIENTATION_PORTRAIT` = 1、`SCREEN_ORIENTATION_LANDSCAPE` = 0，
/// 「跟随系统」取 `SCREEN_ORIENTATION_UNSPECIFIED` = -1。
const ACTIVITY_SCREEN_ORIENTATION_PORTRAIT: i32 = 1;
const ACTIVITY_SCREEN_ORIENTATION_LANDSCAPE: i32 = 0;
const ACTIVITY_SCREEN_ORIENTATION_UNSPECIFIED: i32 = -1;

/// 等 JNI 回调返回的上限。方向锁定是启动路径上的一次性动作，卡住也不该把 IPC 线程永久占住。
#[cfg(target_os = "android")]
const JNI_CALL_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

/// `'portrait'` → 1、`'landscape'` → 0、其余（含 `null`）→ -1。
///
/// 兜底是 `UNSPECIFIED` 而不是竖屏：平板形态与「不锁」都不该被悄悄锁成竖屏，
/// 而认不出的值恰好就是「不锁」的语义。
fn orientation_value(orientation: Option<&str>) -> i32 {
    match orientation {
        Some("portrait") => ACTIVITY_SCREEN_ORIENTATION_PORTRAIT,
        Some("landscape") => ACTIVITY_SCREEN_ORIENTATION_LANDSCAPE,
        _ => ACTIVITY_SCREEN_ORIENTATION_UNSPECIFIED,
    }
}

/// 设置屏幕方向。
///
/// 两步：① `with_webview` 在主线程上取到 wry 的 `JniHandle`（它是一次性的 `Copy` 句柄，
/// 可以带回 IPC 线程）；② 用 `exec` 把闭包送回**主循环线程**执行——**JNIEnv 不可跨线程**，
/// 故不能在这一层直接拿。
///
/// `with_webview` 自己会等到主线程把闭包跑完，故 ① 的 `recv_timeout` 只是兜底；
/// ② 的 `exec` 是异步投递，必须等回调把结果送回来（带 5 秒上限，失败即报错、不挂住调用方）。
#[cfg(target_os = "android")]
#[tauri::command]
pub fn set_screen_orientation(
    app: tauri::AppHandle,
    orientation: Option<String>,
) -> Result<(), String> {
    use jni::objects::JValue;
    use std::sync::mpsc;
    use tauri::Manager;

    let window = app
        .get_webview_window("main")
        .or_else(|| app.webview_windows().into_values().next())
        .ok_or_else(|| "找不到可用的窗口".to_string())?;

    let (handle_tx, handle_rx) = mpsc::channel();
    window
        .with_webview(move |webview| {
            let _ = handle_tx.send(webview.jni_handle());
        })
        .map_err(|e| e.to_string())?;
    let jni_handle = handle_rx
        .recv_timeout(JNI_CALL_TIMEOUT)
        .map_err(|_| "取 JNI 句柄超时".to_string())?;

    let value = orientation_value(orientation.as_deref());
    let (tx, rx) = mpsc::channel();
    jni_handle.exec(move |env, activity, _webview| {
        // 闭包返回 `()`，故用内层闭包包住 `?`：任何一步失败都只经 channel 交回，不 panic。
        let result = (|| -> Result<(), String> {
            // 进门先清一次挂起异常：上一次 JNI 调用留下的异常会让本次 `call_method` 直接拒绝执行。
            if env.exception_check().map_err(|e| e.to_string())? {
                env.exception_clear().map_err(|e| e.to_string())?;
            }
            env.call_method(
                activity,
                "setRequestedOrientation",
                "(I)V",
                &[JValue::Int(value)],
            )
            .map_err(|e| e.to_string())?;
            if env.exception_check().map_err(|e| e.to_string())? {
                // 异常必须在这里清掉：留在 VM 上的挂起异常会污染同一线程上的后续 JNI 调用。
                env.exception_clear().map_err(|e| e.to_string())?;
                return Err("setRequestedOrientation 抛出异常".to_string());
            }
            Ok(())
        })();
        let _ = tx.send(result);
    });

    match rx.recv_timeout(JNI_CALL_TIMEOUT) {
        Ok(result) => result,
        Err(_) => Err("设置屏幕方向超时".to_string()),
    }
}

/// 非安卓端：无操作。桌面不锁方向（`orientationFor` 对桌面返回 `null`，前端也不会调）。
#[cfg(not(target_os = "android"))]
#[tauri::command]
pub fn set_screen_orientation() -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::orientation_value;

    #[test]
    fn portrait_and_landscape_map_to_activity_constants() {
        assert_eq!(orientation_value(Some("portrait")), 1);
        assert_eq!(orientation_value(Some("landscape")), 0);
    }

    /// `null`（桌面 / 平板换形态）必须解到 `UNSPECIFIED` 而不是竖屏：
    /// 写成竖屏会让平板形态下的应用被永久锁成竖屏。
    #[test]
    fn null_and_unknown_mean_unspecified() {
        assert_eq!(orientation_value(None), -1);
        assert_eq!(orientation_value(Some("")), -1);
        assert_eq!(orientation_value(Some("diagonal")), -1);
    }
}
