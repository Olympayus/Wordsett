//! 托盘常驻骨架（00 篇 §5、04 篇 §2.5）。
//!
//! **不做任何图标加工**（设计 §3 D3/D9）：不设 `icon_as_template`、不画角标、
//! 不画圆点、不用 `set_title`。双平台同构，数字只出现在 tooltip 与菜单第二项里。
//! 原计划里 Windows 用 tiny-skia 动态重绘、macOS 用 `set_title` 两条均已舍去。
//!
//! 图标存废**跟随 `window.close_to_tray`**：该值为 false 时不创建图标，
//! 否则会出现「选了直接退出却还留着一个托盘图标」。

use std::sync::Mutex;

use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

use crate::config;

/// 关窗分流的三条去向。抽成枚举是为了让四种组合可单测——
/// 真正的 `CloseRequested` 处理要一个真实窗口才能跑。
#[derive(Debug, PartialEq, Eq)]
pub enum CloseAction {
    /// 首次关窗：拦下并让前端弹窗。
    Ask,
    /// 已确认过且要常驻：隐藏窗口。
    Hide,
    /// 已确认过且不要常驻：退出进程。
    Exit,
}

/// 关窗分流表（设计 §4.5）。`seen = false` 时 `close_to_tray` 取什么都不影响结果：
/// 第一次关窗一律先问一次，不能被用户手改的配置绕过。
pub fn close_action(close_dialog_seen: bool, close_to_tray: bool) -> CloseAction {
    match (close_dialog_seen, close_to_tray) {
        (false, _) => CloseAction::Ask,
        (true, true) => CloseAction::Hide,
        (true, false) => CloseAction::Exit,
    }
}

/// 托盘菜单第二项的文案。`None` = 该行不该存在。
pub fn badge_text(remaining: u32, show: bool) -> Option<String> {
    if !show {
        return None;
    }
    Some(if remaining == 0 {
        "今日无待复习".to_string()
    } else {
        format!("今日剩余 {remaining} 张")
    })
}

/// 图标悬停提示。没有数字可说时退回纯应用名。
pub fn tooltip_text(remaining: u32, show: bool) -> String {
    if !show || remaining == 0 {
        "Wordsett".to_string()
    } else {
        format!("Wordsett · 今日剩余 {remaining} 张")
    }
}

/// 脏标记：数字没变就不更新菜单与 tooltip（00 §5「变更才重绘」的同一意图，
/// 只是重绘对象从图标换成了文本）。
pub fn should_update(last: Option<u32>, next: u32) -> bool {
    last != Some(next)
}

/// 托盘图标 id。增删与查都用它。
const TRAY_ID: &str = "main-tray";
const MENU_SHOW: &str = "tray-show";
const MENU_DUE: &str = "tray-due";
const MENU_QUIT: &str = "tray-quit";

/// 需要跨命令留存的状态。菜单项句柄拿得到才能改文案。
#[derive(Default)]
pub struct TrayState {
    due: Mutex<Option<tauri::menu::MenuItem<tauri::Wry>>>,
    last: Mutex<Option<u32>>,
}

/// 建托盘图标。菜单：显示主窗 / 今日剩余 N 张（灰显）/ 退出。
///
/// 关于图标存活：`build(app)` 返回的 `TrayIcon` 句柄**可以**在此丢弃。
/// tauri 在 `TrayIcon::register` 里已经把图标的一份引用存进了 resources table
/// （`resources_table().add(self.clone())`，见 tauri-2.11.5/src/tray/mod.rs:421-456），
/// `TrayIcon<R>` 又是 `Clone`（内部 `inner` 为 Rc 引用计数，tray/mod.rs:404-412），
/// 所以丢掉这个返回值只是少一份引用，图标仍由 resources table 持有并可见；
/// 反而保留句柄会与 `remove` 里「靠 drop 句柄销毁」的语义重复。
pub fn init(app: &AppHandle) -> Result<(), String> {
    if app.tray_by_id(TRAY_ID).is_some() {
        return Ok(());
    }

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| "应用没有默认窗口图标，托盘无法建立".to_string())?;

    let show = MenuItemBuilder::with_id(MENU_SHOW, "显示主窗")
        .build(app)
        .map_err(|e| e.to_string())?;
    let due = MenuItemBuilder::with_id(MENU_DUE, "今日无待复习")
        .enabled(false)
        .build(app)
        .map_err(|e| e.to_string())?;
    let quit = MenuItemBuilder::with_id(MENU_QUIT, "退出")
        .build(app)
        .map_err(|e| e.to_string())?;

    let menu = MenuBuilder::new(app)
        .items(&[&show, &due, &quit])
        .build()
        .map_err(|e| e.to_string())?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        // 不设 icon_as_template：托盘图标直接用现成应用图标（设计 §3 D9），
        // 现有 logo 是暂用替代，正式图标到位后统一替换。
        .menu(&menu)
        // 左键不弹菜单，留给「显示主窗」——与菜单首项同一动作。
        .show_menu_on_left_click(false)
        .tooltip(tooltip_text(0, config::bool_at(&config::get(), "tray.show_due_count", true)))
        .on_menu_event(|app, event| match event.id().0.as_str() {
            MENU_SHOW => crate::show_main_window(app),
            // 退出是一次到位：不走 CloseRequested，否则关窗分流会再拦一道。
            MENU_QUIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                crate::show_main_window(tray.app_handle());
            }
        })
        .build(app)
        .map_err(|e| e.to_string())?;

    if let Some(state) = app.try_state::<TrayState>() {
        if let Ok(mut d) = state.due.lock() {
            *d = Some(due);
        }
        // 新建的图标永远是「0/默认」文案（菜单项与 tooltip 都是），故脏标记也归零：
        // 若在「无图标」期间有人上报过数字，不清掉它就会让重建后的图标停在默认文案上
        // 不再刷新。与 `remove` 的清理对称，兑现那句「重建后必须重新上报一次数字」。
        if let Ok(mut l) = state.last.lock() {
            *l = None;
        }
    }
    Ok(())
}

/// 按 `window.close_to_tray` 增删托盘图标。开关切换与关窗结论都走这里。
pub fn sync(app: &AppHandle) -> Result<(), String> {
    let on = config::bool_at(&config::get(), "window.close_to_tray", true);
    if on {
        init(app)
    } else {
        remove(app);
        Ok(())
    }
}

/// 移除托盘图标，并清掉句柄与脏标记（重建后必须重新上报一次数字）。
pub fn remove(app: &AppHandle) {
    // 返回值必须在**这里**丢掉：`remove_tray_by_id` 只是把句柄从 tauri 的内部状态里摘出，
    // 真正让图标消失的是这个 `TrayIcon` 被 drop（见 tauri/src/app.rs:836-839 的说明）。
    // 本文件没有再 clone 过它，所以丢掉即销毁。
    let _removed = app.remove_tray_by_id(TRAY_ID);
    if let Some(state) = app.try_state::<TrayState>() {
        if let Ok(mut d) = state.due.lock() {
            *d = None;
        }
        if let Ok(mut l) = state.last.lock() {
            *l = None;
        }
    }
}

/// 上报待复习卡数。数字没变就不动菜单与 tooltip。
pub fn set_due_count(app: &AppHandle, remaining: u32) {
    let Some(state) = app.try_state::<TrayState>() else { return };

    {
        let Ok(mut last) = state.last.lock() else { return };
        if !should_update(*last, remaining) {
            return;
        }
        *last = Some(remaining);
    }

    let show = config::bool_at(&config::get(), "tray.show_due_count", true);

    if let Ok(due) = state.due.lock() {
        if let Some(item) = due.as_ref() {
            if let Some(text) = badge_text(remaining, show) {
                let _ = item.set_text(text);
            }
        }
    }

    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(tooltip_text(remaining, show)));
    }
}

#[tauri::command]
pub fn update_tray_badge(app: AppHandle, remaining: u32) {
    set_due_count(&app, remaining);
}

/// 前端弹窗的结论落回 Rust：写配置、同步托盘、执行隐藏或退出。
///
/// 「直接退出」走 `app.exit(0)` 而不是关窗——关窗会再次触发 `CloseRequested`，
/// 在 `close_dialog_seen` 已为 true 时反倒要绕一圈才退出。
#[tauri::command]
pub fn resolve_close_request(app: AppHandle, close_to_tray: bool) -> Result<(), String> {
    config::set_patch(serde_json::json!({
        "window": { "close_dialog_seen": true, "close_to_tray": close_to_tray }
    }))?;

    if close_to_tray {
        sync(&app)?;
        crate::hide_main_window(&app);
    } else {
        remove(&app);
        app.exit(0);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{badge_text, close_action, should_update, tooltip_text, CloseAction};

    #[test]
    fn badge_text_covers_both_ends() {
        assert_eq!(badge_text(12, true).as_deref(), Some("今日剩余 12 张"));
        assert_eq!(badge_text(0, true).as_deref(), Some("今日无待复习"));
        assert_eq!(badge_text(12, false), None, "关掉开关时该行整体消失");
        assert_eq!(badge_text(0, false), None);
    }

    #[test]
    fn tooltip_drops_the_number_when_zero_or_off() {
        assert_eq!(tooltip_text(12, true), "Wordsett · 今日剩余 12 张");
        assert_eq!(tooltip_text(0, true), "Wordsett");
        assert_eq!(tooltip_text(12, false), "Wordsett");
    }

    #[test]
    fn should_update_is_a_dirty_check() {
        assert!(should_update(None, 12), "首次上报必须更新");
        assert!(!should_update(Some(12), 12), "数字没变不更新");
        assert!(should_update(Some(12), 11));
        assert!(should_update(Some(12), 0), "归零同样是一次变化");
    }

    /// Review Focus 4：四种组合都必须有确定行为。
    /// 尤其是 `seen = false` 那一列——`close_to_tray` 取什么都不该改变「先问一次」，
    /// 否则用户手改文件就能让弹窗永不出现（或每次都出现）。
    #[test]
    fn close_action_covers_all_four_combinations() {
        assert_eq!(close_action(false, true), CloseAction::Ask, "首次一律先问");
        assert_eq!(close_action(false, false), CloseAction::Ask, "首次一律先问");
        assert_eq!(close_action(true, true), CloseAction::Hide);
        assert_eq!(close_action(true, false), CloseAction::Exit);
    }
}
