//! 屏幕方向（Task 10）：安卓上把窗口锁到竖屏 / 横屏。
//!
//! 前端只在**手机外壳挂载时**调一次 `set_screen_orientation`（`orientationFor` 说手机锁竖屏、
//! 平板锁横屏、桌面不锁）。桌面这条路径不存在——`MobileShell` 只在 `android-phone` 下挂载。
//!
//! 为什么写 Rust 而不是直接给 Activity 写 `android:screenOrientation`：锁方向与解锁方向走的是
//! 同一个命令（`setRequestedOrientation(UNSPECIFIED)`），而这个值**刻意不进 `tauri.conf.json`**——
//! 平板形态与手机形态是同一套 APK，Manifest 里只能写死一个。
//!
//! 实现走 JNI 而不是 `tauri-plugin-screen-orientation`：后者会把插件自己的清单权限与构建步骤
//! 一并带进来，而这里要的只是「拿到 Activity 再设一个 int」。

/// `Activity.SCREEN_ORIENTATION_PORTRAIT` = 1、`SCREEN_ORIENTATION_LANDSCAPE` = 0，
/// 「跟随系统」取 `SCREEN_ORIENTATION_UNSPECIFIED` = -1。
#[cfg(target_os = "android")]
const ACTIVITY_SCREEN_ORIENTATION_PORTRAIT: i32 = 1;
#[cfg(target_os = "android")]
const ACTIVITY_SCREEN_ORIENTATION_LANDSCAPE: i32 = 0;
#[cfg(target_os = "android")]
const ACTIVITY_SCREEN_ORIENTATION_UNSPECIFIED: i32 = -1;

/// `'portrait'` → 1、`'landscape'` → 0、其余（含 `null`）→ -1。
///
/// 兜底是 `UNSPECIFIED` 而不是竖屏：平板形态与「不锁」都不该被悄悄锁成竖屏，
/// 而认不出的值恰好就是「不锁」的语义。
#[cfg(target_os = "android")]
fn orientation_value(orientation: Option<&str>) -> i32 {
    match orientation {
        Some("portrait") => ACTIVITY_SCREEN_ORIENTATION_PORTRAIT,
        Some("landscape") => ACTIVITY_SCREEN_ORIENTATION_LANDSCAPE,
        _ => ACTIVITY_SCREEN_ORIENTATION_UNSPECIFIED,
    }
}

/// 设置屏幕方向。
///
/// `activity` 取自 `ndk_context::android_context()`——它是当前进程 `Activity` 的
/// `GlobalRef`（JNI 环境下恒可用，Tauri 的安卓端就是它起的），`JObject::from_raw` 直接转成
/// JNI 对象。
///
/// 异常处理：Java 侧抛异常时 `call_method` 返回 `Err`——异常**不会**留在 VM 上，
/// 故 `?` 这一下已经把异常清掉了。末尾那次 `exception_check` 是兜底：JNI 规范允许
/// 「调用返回后仍有挂起异常」的状态存在，不查一次就把它带进下一次 JNI 调用。
#[cfg(target_os = "android")]
#[tauri::command]
pub fn set_screen_orientation(
    _activity: tauri::AppHandle,
    orientation: Option<String>,
) -> Result<(), String> {
    use jni::objects::{JObject, JValue};
    use ndk_context::android_context;

    let global = android_context();
    // `context()` 是 `*mut c_void`（多数情况下就是 Activity，见 crate 文档）。
    // 空指针即「拿不到 Activity」——静默放过（这条路径不该发生，但为它拦住启动不值得）。
    let context_ptr = global.context();
    if context_ptr.is_null() {
        return Ok(());
    }

    // `vm()` 是 `*mut c_void`，`JavaVM::from_raw` 收 `*mut sys::JavaVM`——两者 ABI 都是指针。
    let vm = unsafe { jni::JavaVM::from_raw(global.vm().cast()) }.map_err(|e| e.to_string())?;
    // 本命令由 Tauri 派发：派发线程已经在 JVM 里，故用 `get_env` 而不是 `attach_current_thread`
    // （后者会给一个 Rust 自己起的线程用，代价是每次调用都 attach/detach）。
    let mut env = vm.get_env().map_err(|e| e.to_string())?;

    // 第一个参数 `self`：`setRequestedOrientation` 是实例方法，`(I)V` 收一个 int、不返回值。
    // `JObject::from_raw` 是 unsafe 的（它假定传进来的是活的 JNI 引用）——`context()` 给的
    // GlobalRef 满足这条前提。
    let activity = unsafe { JObject::from_raw(context_ptr.cast()) };
    let value = orientation_value(orientation.as_deref());
    env.call_method(
        activity,
        "setRequestedOrientation",
        "(I)V",
        &[JValue::Int(value)],
    )
    .map_err(|e| e.to_string())?;

    // 走到这里说明调用返回了；兜底清一次挂起的异常（见上方注释）。
    if env.exception_check().map_err(|e| e.to_string())? {
        env.exception_clear().map_err(|e| e.to_string())?;
        return Err("setRequestedOrientation 抛出异常".to_string());
    }
    Ok(())
}

/// 非安卓端：无操作。平板与桌面不锁方向（`orientationFor` 对桌面返回 `null`，前端也不会调）。
#[cfg(not(target_os = "android"))]
#[tauri::command]
pub fn set_screen_orientation() -> Result<(), String> {
    Ok(())
}

#[cfg(all(test, target_os = "android"))]
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
    }
}
