//! 托盘常驻骨架（00 篇 §5、04 篇 §2.5）。
//!
//! **不做任何图标加工**（设计 §3 D3/D9）：不设 `icon_as_template`、不画角标、
//! 不画圆点、不用 `set_title`。双平台同构，数字只出现在 tooltip 与菜单第二项里。
//! 原计划里 Windows 用 tiny-skia 动态重绘、macOS 用 `set_title` 两条均已舍去。
//!
//! 图标存废**跟随 `window.close_to_tray`**：该值为 false 时不创建图标，
//! 否则会出现「选了直接退出却还留着一个托盘图标」。

use std::sync::Mutex;

use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder};
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

/// 托盘菜单中间那行（今日剩余 N 张）是否该出现。
///
/// 设计 §4.5：`tray.show_due_count` 关掉时**整行移除**（不是灰显、不是换文字），
/// 图标与其余两行原样保留；打开时该行回来。`tray_built` 表达「此刻托盘本就该在」——
/// 为假时连托盘都不建、更没有菜单，生产调用点恒传真，入参只为把
/// 「行存在 ⇔ 托盘在 ∧ 开关开」钉成一张可测真值表（Finding 1 的回归闸）。
pub fn shows_due_row(tray_built: bool, show_due_count: bool) -> bool {
    tray_built && show_due_count
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

/// 构造托盘菜单。`with_due` 决定中间「今日剩余 N 张」那行在不在（设计 §4.5）。
/// 返回菜单本身与那行（若存在）的句柄，供调用方存进 `TrayState` 以改文案。
fn build_menu(
    app: &AppHandle,
    with_due: bool,
) -> Result<(Menu<tauri::Wry>, Option<tauri::menu::MenuItem<tauri::Wry>>), String> {
    let show = MenuItemBuilder::with_id(MENU_SHOW, "显示主窗")
        .build(app)
        .map_err(|e| e.to_string())?;
    let quit = MenuItemBuilder::with_id(MENU_QUIT, "退出")
        .build(app)
        .map_err(|e| e.to_string())?;

    if with_due {
        let due = MenuItemBuilder::with_id(MENU_DUE, "今日无待复习")
            .enabled(false)
            .build(app)
            .map_err(|e| e.to_string())?;
        let menu = MenuBuilder::new(app)
            .items(&[&show, &due, &quit])
            .build()
            .map_err(|e| e.to_string())?;
        Ok((menu, Some(due)))
    } else {
        let menu = MenuBuilder::new(app)
            .items(&[&show, &quit])
            .build()
            .map_err(|e| e.to_string())?;
        Ok((menu, None))
    }
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

    let show_due = config::bool_at(&config::get(), "tray.show_due_count", true);
    let (menu, due) = build_menu(app, shows_due_row(true, show_due))?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        // 不设 icon_as_template：托盘图标直接用现成应用图标（设计 §3 D9），
        // 现有 logo 是暂用替代，正式图标到位后统一替换。
        .menu(&menu)
        // 左键不弹菜单，留给「显示主窗」——与菜单首项同一动作。
        .show_menu_on_left_click(false)
        .tooltip(tooltip_text(0, show_due))
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
            *d = due;
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

/// 把 `remaining` 落到菜单第二行与 tooltip。
///
/// `force = false`（常规 60s 轮询）时先过脏标记——数字没变就不动。
/// `force = true` 用于配置变更后的强制重绘：那时菜单行可能刚被换过、tooltip 可能刚
/// 被清过，脏标记反而会拦掉这次必要的刷新（Finding 2 / 约束 (e)）。
fn render_due(app: &AppHandle, remaining: u32, force: bool) {
    let Some(state) = app.try_state::<TrayState>() else { return };

    {
        let Ok(mut last) = state.last.lock() else { return };
        if !force && !should_update(*last, remaining) {
            return;
        }
        *last = Some(remaining);
    }

    let show = config::bool_at(&config::get(), "tray.show_due_count", true);

    // 开关关掉时 `state.due` 就是 None（那行已被移出菜单），此处自然跳过；
    // `badge_text` 也会再兜一层（返回 None 即不写文案）。
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

/// 上报待复习卡数。数字没变就不动菜单与 tooltip。
pub fn set_due_count(app: &AppHandle, remaining: u32) {
    render_due(app, remaining, false);
}

#[tauri::command]
pub fn update_tray_badge(app: AppHandle, remaining: u32) {
    set_due_count(&app, remaining);
}

/// 配置变更后按当前配置重新应用托盘：图标存废、菜单行构成、tooltip 文字。
///
/// Finding 3：原先只有关窗结论会碰 `sync`，从设置页改开关要重启才生效
/// （Task 8 Step 4 验收 #3「关掉最小化到托盘 → 图标消失」因此不可达）。
/// 本命令把它补上，设置页改完两个开关后调用即可。约束：
/// - (c) 只改开关时**不重建图标**，只换菜单（`TrayIcon::set_menu`）→ 不闪、不重排；
/// - (a)(b) 关闭 `tray.show_due_count` 时那行真的移出菜单，打开时回来（§4.5）；
/// - (f) `window.close_to_tray` 决定图标存废；
/// - (d)(e)(g) 强制重绘：先取回上一次上报的数字，换菜单后立刻补画一次——
///   脏标记在配置变更时会被绕过，否则 tooltip 会停在旧值直到下次 60s 轮询。
#[tauri::command]
pub fn sync_tray(app: AppHandle) -> Result<(), String> {
    resync(&app)
}

/// `sync_tray` 的实现。与 `sync` 的区别：本函数做**全量重应用**（含菜单行构成与
/// 强制重绘），而 `sync` 只在关窗结论里按 `close_to_tray` 增删图标。
fn resync(app: &AppHandle) -> Result<(), String> {
    let cfg = config::get();
    let close_to_tray = config::bool_at(&cfg, "window.close_to_tray", true);
    let show_due = config::bool_at(&cfg, "tray.show_due_count", true);

    // (g) 重建会清脏标记，先取回上一次上报的数字，供下面强制补画。
    let last = app
        .try_state::<TrayState>()
        .and_then(|s| s.last.lock().ok().and_then(|l| *l));

    if !close_to_tray {
        // (f) 开关关掉：图标消失。
        remove(app);
        return Ok(());
    }

    if app.tray_by_id(TRAY_ID).is_some() {
        // (c) 图标已在：只换菜单，绝不动图标本身。
        let (menu, due) = build_menu(app, shows_due_row(true, show_due))?;
        if let Some(tray) = app.tray_by_id(TRAY_ID) {
            tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
        }
        if let Some(state) = app.try_state::<TrayState>() {
            if let Ok(mut d) = state.due.lock() {
                *d = due;
            }
        }
    } else {
        // (f) 开关打开：建图标，`init` 已按当前 `show_due` 建好菜单。
        init(app)?;
    }

    // (d)(e)(g) 强制补画：tooltip 与行文字立刻回到正确值。
    if let Some(n) = last {
        render_due(app, n, true);
    }
    Ok(())
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
    use super::{
        badge_text, close_action, should_update, shows_due_row, tooltip_text, CloseAction,
    };

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

    /// Finding 1 的回归闸：菜单中间那行「存在 ⇔ 托盘在 ∧ 开关开」。
    /// 尤其钉住「托盘在但开关关 → 那行不该存在」——旧实现只 set_text、从不移除，
    /// 关掉开关后该行会一直留着，正是这条要在单测里挡住的。
    #[test]
    fn due_row_present_iff_tray_built_and_switch_on() {
        assert!(shows_due_row(true, true), "托盘在且开关开：该行存在");
        assert!(!shows_due_row(true, false), "托盘在但开关关：该行必须移除");
        assert!(!shows_due_row(false, true), "托盘不在：根本没有菜单行");
        assert!(!shows_due_row(false, false));
    }
}
