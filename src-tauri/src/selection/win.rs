//! Windows 选区读取（v0.7.9 划词收录，Task 3）。
//!
//! 走 UI Automation 的 TextPattern：取焦点元素的 TextPattern2 → `GetSelection()`
//! → 逐段 `GetText(-1)` → `join_ranges`。本函数同步、无全局状态；防卡顿由 Task 2
//! `read_with` 在调用侧提供（生产 500ms 预算），故这里不做任何超时 / 线程处理。
//!
//! COM 以 MTA 初始化。线程若已被别人以另一种单元模型初始化（`RPC_E_CHANGED_MODE`），
//! COM 本身仍然可用，照常继续——只是这次调用不算我们的，不能配 `CoUninitialize`。

use windows::core::HRESULT;
use windows::Win32::Foundation::{E_ACCESSDENIED, RPC_E_CHANGED_MODE};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationTextPattern2, UIA_TextPatternId,
};

use crate::selection::SelectionError;

/// COM 初始化的 RAII 守卫：只有本次调用真的初始化成功才在离开作用域时反初始化，
/// 中途提前 `return` 也不会漏配。
struct ComGuard {
    uninitialize: bool,
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.uninitialize {
            unsafe { CoUninitialize() };
        }
    }
}

fn init_com() -> Result<ComGuard, SelectionError> {
    let hresult = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    if hresult.is_ok() {
        return Ok(ComGuard { uninitialize: true });
    }
    if hresult == RPC_E_CHANGED_MODE {
        // 已有别的组件在这条线程上初始化过 COM（单元模型不同）。COM 可用，继续；
        // 那次初始化不归我们，故守卫不反初始化。
        return Ok(ComGuard { uninitialize: false });
    }
    Err(map_hresult(hresult))
}

/// COM / UIA 的 HRESULT → 选区错误：拒绝访问单列，其余原样带码供设置页诊断。
fn map_hresult(hresult: HRESULT) -> SelectionError {
    if hresult == E_ACCESSDENIED {
        SelectionError::Denied
    } else {
        SelectionError::Os(format!("{:#x}", hresult.0))
    }
}

/// 把多段选区的文本合并成一条：每段 trim、丢掉空段、以单个空格连接；
/// 合并后仍为空（没有选区 / 全是空白）→ `Empty`。
#[allow(dead_code)]
pub(crate) fn join_ranges(texts: Vec<String>) -> Result<String, SelectionError> {
    let joined = texts
        .iter()
        .map(|text| text.trim())
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    if joined.is_empty() {
        return Err(SelectionError::Empty);
    }
    Ok(joined)
}

/// 读取当前前台控件的文本选区。
///
/// 焦点控件不暴露 TextPattern（终端、自绘控件等）→ `Unsupported`；确实没有选中
/// 文本 → `Empty`；系统拒绝访问 → `Denied`；其余系统错误 → `Os(码)`。
pub fn read_selection() -> Result<String, SelectionError> {
    // 守卫必须活到函数结尾：COM 对象（automation / pattern / range）都在它之后创建、
    // 先于它析构，顺序由局部变量的逆序 drop 保证。
    let _com = init_com()?;

    let automation: IUIAutomation =
        unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) }
            .map_err(|error| map_hresult(error.code()))?;

    let element = unsafe { automation.GetFocusedElement() }
        .map_err(|error| map_hresult(error.code()))?;

    // windows 0.58 里这个方法的生成名是 `GetCurrentPatternAs`（对应 UIA 的
    // IUIAutomationElement::GetCurrentPatternAs）。取不到 TextPattern 即视为
    // 「该控件不支持文本选区」——这是常态而非异常，故映射成 Unsupported。
    let pattern: IUIAutomationTextPattern2 =
        unsafe { element.GetCurrentPatternAs(UIA_TextPatternId) }.map_err(|error| {
            if error.code() == E_ACCESSDENIED {
                SelectionError::Denied
            } else {
                SelectionError::Unsupported
            }
        })?;

    // TextPattern2 继承 TextPattern，`GetSelection` 由 Deref 提供。
    let ranges = unsafe { pattern.GetSelection() }.map_err(|error| map_hresult(error.code()))?;
    let length = unsafe { ranges.Length() }.map_err(|error| map_hresult(error.code()))?;

    let mut texts = Vec::with_capacity(length.max(0) as usize);
    for index in 0..length {
        let range =
            unsafe { ranges.GetElement(index) }.map_err(|error| map_hresult(error.code()))?;
        // -1 = 取整段文本（UIA 的约定）。
        let text = unsafe { range.GetText(-1) }.map_err(|error| map_hresult(error.code()))?;
        texts.push(text.to_string());
    }

    join_ranges(texts)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn join_ranges_trims_and_rejects_all_blank() {
        assert_eq!(join_ranges(vec![" foo".into(), "bar ".into()]).unwrap(), "foo bar");
        assert!(matches!(join_ranges(vec!["  ".into()]), Err(SelectionError::Empty)));
    }
}
