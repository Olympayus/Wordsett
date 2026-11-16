//! macOS 选区读取（v0.7.9 划词收录，Task 4）。
//!
//! 走辅助功能（Accessibility）API：系统级 AX 元素 → `kAXFocusedUIElementAttribute`
//! 取聚焦元素 → `kAXSelectedTextAttribute` 取选中文本。与 Windows 的 UIA 路径对应：
//! 本函数同步、无全局状态；防卡顿由 Task 2 `read_with` 在调用侧提供（生产 500ms 预算），
//! 故这里不做任何超时 / 线程处理。
//!
//! **本文件为盲写**：开发机是 Windows，Apple 的 AX API 无法在此编译或运行；代码按
//! 官方头文件（`AXUIElement.h` / `AXAttributeConstants.h`）的契约编写。所有权规则
//! （Create / Copy Rule 的引用归我们、必须 `CFRelease`；Get Rule 的引用不归我们、
//! 绝不能释放）在每一处都按 API 契约注释，供 macOS 侧复核。

use core_foundation::base::{CFGetTypeID, CFRelease, CFTypeRef, TCFType};
use core_foundation::string::{CFString, CFStringRef};

use crate::selection::SelectionError;

/// `AXError`：`AXUIElement.h` 里的 `typedef int32_t AXError;`。
type AXError = i32;

/// `kAXErrorSuccess`：调用成功。
const K_AX_ERROR_SUCCESS: AXError = 0;
/// `kAXErrorAttributeUnsupported`：该元素不暴露这个属性。
const K_AX_ERROR_ATTRIBUTE_UNSUPPORTED: AXError = -25205;
/// `kAXErrorAPIDisabled`：进程没有辅助功能信任（与 `AXIsProcessTrusted() == false` 同义）。
const K_AX_ERROR_API_DISABLED: AXError = -25211;
/// `kAXErrorNoValue`：属性存在但当前没有值（例如没有选区的文本控件）。
const K_AX_ERROR_NO_VALUE: AXError = -25212;

/// `kAXFocusedUIElementAttribute`：系统级元素上取「当前聚焦的 UI 元素」。
const K_AX_FOCUSED_UI_ELEMENT_ATTRIBUTE: &str = "AXFocusedUIElement";
/// `kAXSelectedTextAttribute`：元素上当前选中的文本（CFString）。
const K_AX_SELECTED_TEXT_ATTRIBUTE: &str = "AXSelectedText";

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    /// 创建系统级 AX 元素。遵循 Create Rule：调用方持有引用，用完必须 `CFRelease`。
    fn AXUIElementCreateSystemWide() -> CFTypeRef;

    /// 读取元素上的一个属性。
    ///
    /// 成功（返回 `kAXErrorSuccess`）时 `value` 被写成 Copy Rule 的引用（+1，调用方
    /// 必须 `CFRelease`）；失败时 `value` 无定义，**不归调用方**，不能释放。
    fn AXUIElementCopyAttributeValue(
        element: CFTypeRef,
        attribute: CFStringRef,
        value: *mut CFTypeRef,
    ) -> AXError;

    /// 进程是否被授予辅助功能信任。返回 CF 的 `Boolean`（`unsigned char`），非 0 即已授权。
    ///
    /// 这里用 `u8` 而不是 `bool`（`platform.rs` 声明的是 `bool`）：C 的 `Boolean` 是
    /// `unsigned char`，若系统返回 0 / 1 之外的字节，落进 Rust `bool` 是未定义行为；
    /// 按 `u8` 读再做 `!= 0` 判断没有这个隐患。两者语义一致。
    fn AXIsProcessTrusted() -> u8;
}

/// 持有 Create / Copy Rule 引用的 RAII 守卫：离开作用域时 `CFRelease`。
///
/// **只包我们自己创建或复制的引用**。Get Rule 拿到的引用不归我们，绝不能套这个守卫。
struct CfOwned(CFTypeRef);

impl CfOwned {
    /// 接管一个 Create / Copy Rule 的引用。
    ///
    /// 空指针意味着 API 没有给出对象（文档承诺成功时不会为空），按系统错误上报，
    /// 且绝不把空指针交给 `CFRelease`。
    fn from_create_rule(pointer: CFTypeRef) -> Result<Self, SelectionError> {
        if pointer.is_null() {
            Err(SelectionError::Os("AX API 返回空引用".to_string()))
        } else {
            Ok(Self(pointer))
        }
    }

    /// 裸引用，仅用于传给别的 AX / CF 函数；所有权仍在本守卫。
    fn raw(&self) -> CFTypeRef {
        self.0
    }
}

impl Drop for CfOwned {
    fn drop(&mut self) {
        if !self.0.is_null() {
            // 所有权由 Create / Copy Rule 转移给我们（见各调用点注释）。
            unsafe { CFRelease(self.0) };
        }
    }
}

/// AX 错误码 → 选区错误。
///
/// - 「属性不存在」（`kAXErrorAttributeUnsupported`）对选区读取而言是「这个控件不提供
///   文本选区」，属常态降级而非异常——与 `win.rs` 把缺失 TextPattern 映射成
///   `Unsupported` 同一口径。
/// - 「属性在、当前无值」（`kAXErrorNoValue`）是「有选区接口但没选中文本」，
///   spec §5.1 的 `Empty`；与 Windows 侧选区 range 数为 0 时返回 `Empty` 对齐，
///   避免把「用户没选中东西」误报成「应用不支持」。
fn map_ax_error(error: AXError) -> SelectionError {
    match error {
        K_AX_ERROR_API_DISABLED => SelectionError::Denied,
        K_AX_ERROR_ATTRIBUTE_UNSUPPORTED => SelectionError::Unsupported,
        K_AX_ERROR_NO_VALUE => SelectionError::Empty,
        code => SelectionError::Os(format!("AXError {code}")),
    }
}

/// 复制 `element` 上的 `attribute`，返回由守卫持有的 Copy Rule 引用。
///
/// 属性名以 `CFString::new` 构造，本函数返回时随 `name` 一起释放（CFString 的 Drop
/// 走 `CFRelease`），不需要手工管理。
fn copy_attribute(element: CFTypeRef, attribute: &str) -> Result<CfOwned, SelectionError> {
    let name = CFString::new(attribute);
    let mut value: CFTypeRef = std::ptr::null();

    // `AXUIElementCopyAttributeValue` 的 element 形参是 `AXUIElementRef`；它本身就是
    // 一个 CFType（`typedef struct __AXUIElement *AXUIElementRef`），与 `CFTypeRef`
    // 在 ABI 上等价，故直接传裸引用。
    let error =
        unsafe { AXUIElementCopyAttributeValue(element, name.as_concrete_TypeRef(), &mut value) };

    if error != K_AX_ERROR_SUCCESS {
        // 失败时 out 参数无定义、不归调用方——不碰 `value`，更不 CFRelease。
        return Err(map_ax_error(error));
    }

    CfOwned::from_create_rule(value)
}

/// 读取当前前台应用的文本选区。
///
/// 未授予辅助功能权限 → `Denied`；焦点控件不暴露 `AXSelectedText`（终端、自绘控件、
/// 部分 PDF 阅读器等）→ `Unsupported`；有选区接口但没有选中文本（含全空白）→ `Empty`；
/// 其余系统错误 → `Os(AXError 码)`。
///
/// 空 / 全空白选区在读取层就归入 `Empty`，与 `win.rs` 的 `join_ranges` 同一口径
/// （「确无选中文本」由读取层判定，`grab.rs` 不应产出空词成功态）。非空时返回原始
/// 文本，清洗与模式判定仍归调用侧。
pub fn read_selection() -> Result<String, SelectionError> {
    // 未授权的进程调 AX 会拿到 kAXErrorAPIDisabled；提前判定可把「没给权限」与
    // 「控件不提供选区」区分开（前端对前者给「前往系统设置」入口）。
    // 该状态在进程启动时求值，用户勾选后通常要重启应用才生效（与 platform.rs 同一契约）。
    if unsafe { AXIsProcessTrusted() } == 0 {
        return Err(SelectionError::Denied);
    }

    // Create Rule：系统级元素归我们，`system_wide` 的 Drop 负责释放。
    let system_wide = CfOwned::from_create_rule(unsafe { AXUIElementCreateSystemWide() })?;

    // Copy Rule：聚焦元素归我们，`focused` 的 Drop 负责释放。
    // 按 AX API 契约，系统级元素上这个属性返回的一定是 AXUIElement。
    let focused = copy_attribute(system_wide.raw(), K_AX_FOCUSED_UI_ELEMENT_ATTRIBUTE)?;

    // Copy Rule：选中文本归我们，`selected` 的 Drop 负责释放。
    let selected = copy_attribute(focused.raw(), K_AX_SELECTED_TEXT_ATTRIBUTE)?;

    // 选中文本必须是 CFString。返回其它类型（数组、数字等）说明这个控件不把选区当
    // 文本暴露 → 与「属性不存在」同一类降级，按 Unsupported 上报。
    if unsafe { CFGetTypeID(selected.raw()) } != CFString::type_id() {
        return Err(SelectionError::Unsupported);
    }

    // Get Rule 包装：`wrap_under_get_rule` 会 retain 一次，`cf_text` 的 Drop 释放这份
    // retain；Copy Rule 的那份仍由 `selected` 释放——不会双重释放，也不会泄漏。
    // `to_string()` 复制成 Rust String，CFString 在函数返回前就释放了。
    let cf_text = unsafe { CFString::wrap_under_get_rule(selected.raw() as CFStringRef) };
    let text = cf_text.to_string();

    // 空 / 全空白选区 → Empty（与 `win.rs` 的 `join_ranges` 对齐）。不在这里 trim
    // 后返回：非空文本保持原样，清洗归调用侧。
    if text.trim().is_empty() {
        return Err(SelectionError::Empty);
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 错误码映射是纯逻辑；本模块整体在 Windows 上不参与编译，故这条测试只在
    /// macOS 构建时运行。
    #[test]
    fn maps_ax_errors_to_selection_categories() {
        assert!(matches!(map_ax_error(-25211), SelectionError::Denied));
        assert!(matches!(map_ax_error(-25205), SelectionError::Unsupported));
        assert!(matches!(map_ax_error(-25212), SelectionError::Empty));
        match map_ax_error(-25204) {
            SelectionError::Os(detail) => assert!(detail.contains("-25204")),
            other => panic!("应映射为 Os，实得 {other:?}"),
        }
    }
}
