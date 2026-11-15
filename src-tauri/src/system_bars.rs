//! 状态栏 / 手势条图标跟随应用主题（Task 9）。
//!
//! 安卓的 edge-to-edge 下，状态栏与手势条图标默认由系统按系统主题着色；应用自己的
//! 浅色 / 深色主题一换，图标就可能压在背景上看不清。前端在主题解析后调
//! `set_system_bars_theme`，这里经 Tauri/wry 的 JNI 通道把 `dark` 交给
//! `MainActivity.applySystemBarsTheme(Z)V`，由 `WindowCompat.getInsetsController`
//! 翻转两处 `isAppearanceLight*`。
//!
//! 通道与超时照抄 `orientation.rs`：`with_webview` 取 wry 的 `JniHandle`（一次性 `Copy`
//! 句柄，可以带回 IPC 线程），再用 `exec` 把闭包送回**主循环线程**执行——JNIEnv 不可跨线程。
//! `exec` 是异步投递，必须等回调把结果送回来（5 秒上限）。
//!
//! 非 Android 端命令为空操作：桌面既没有系统栏也不该有行为变化，但命令仍注册在命令表里，
//! 前端可以无差别 invoke（失败静默由调用方负责）。
//!
//! `should_use_light_icons` 刻意**不带 android cfg**：它把「深色主题 ⇒ 亮色图标」这条
//! 判据钉在宿主机（Windows 上的 `cargo test`）里——安卓专用测试在本环境永远跑不起来。
//! JNI 调用本身直接把 `dark` 交给 Kotlin，取反发生在 `applySystemBarsTheme` 内部。

/// 等 JNI 回调返回的上限。主题切换可能发生在任意时刻（含启动首屏），卡住也不该把
/// IPC 线程永久占住。
#[cfg(target_os = "android")]
const JNI_CALL_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

/// 深色主题要**亮色图标**（浅色主题要深色图标）。
///
/// 名字说的是图标而不是主题：深色主题 ⇒ 亮色图标，故直接返回 `dark`。
/// 注意别和 Kotlin 侧混：`isAppearanceLightStatusBars = true` 的语义是
/// 「状态栏背景是浅色、请用深色图标」，所以 `applySystemBarsTheme(dark)` 内部取 `!dark`。
/// 本函数只在宿主机测试里钉住「深色 ⇒ 亮色图标」这条语义，JNI 调用直接把 `dark`
/// 交给 Kotlin（参数就叫 `dark`、取反发生在 Kotlin 里）。
#[cfg_attr(not(test), allow(dead_code))]
fn should_use_light_icons(dark: bool) -> bool {
    dark
}

/// 让系统栏图标跟随应用主题。
///
/// 两步：① `with_webview` 在主线程上取到 wry 的 `JniHandle`；② 用 `exec` 把
/// `call_method("applySystemBarsTheme", "(Z)V")` 送回主线程执行。
/// 取句柄与等结果各有一个 `JNI_CALL_TIMEOUT` 上限。
#[cfg(target_os = "android")]
#[tauri::command]
pub fn set_system_bars_theme(app: tauri::AppHandle, dark: bool) -> Result<(), String> {
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
                "applySystemBarsTheme",
                "(Z)V",
                &[JValue::Bool(dark as u8)],
            )
            .map_err(|e| e.to_string())?;
            if env.exception_check().map_err(|e| e.to_string())? {
                // 异常必须在这里清掉：留在 VM 上的挂起异常会污染同一线程上的后续 JNI 调用。
                env.exception_clear().map_err(|e| e.to_string())?;
                return Err("applySystemBarsTheme 抛出异常".to_string());
            }
            Ok(())
        })();
        let _ = tx.send(result);
    });

    match rx.recv_timeout(JNI_CALL_TIMEOUT) {
        Ok(result) => result,
        Err(_) => Err("设置系统栏主题超时".to_string()),
    }
}

/// 非安卓端：无操作。桌面没有系统栏，命令仍注册以便前端无差别调用。
#[cfg(not(target_os = "android"))]
#[tauri::command]
pub fn set_system_bars_theme(dark: bool) -> Result<(), String> {
    let _ = dark;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::should_use_light_icons;

    #[test]
    fn dark_theme_uses_light_icons() {
        assert!(should_use_light_icons(true));
        assert!(!should_use_light_icons(false));
    }
}
