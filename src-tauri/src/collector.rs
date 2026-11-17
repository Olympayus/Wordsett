//! 划词小窗的窗口生命周期（v0.7.9 划词收录，Task 5）。
//!
//! 小窗是**预载隐藏**的独立 `WebviewWindow`（label `collector`，URL 带
//! `?window=collector` 由前端 `main.tsx` 分流），不随主窗创建或销毁：热键触发时
//! 只做「贴光标定位 → show → focus」，冷启动成本留在应用启动那一刻。
//!
//! 定位规则（spec §12）：窗口左上角 = 光标 + `CURSOR_OFFSET`，逐轴 clamp 到**光标
//! 所在显示器**的工作区（物理像素）；工作区比窗口还小时贴工作区左上角，而不是产生
//! 负坐标之外的越界位置。`clamp_to_work_area` / `clamp_position` 是本模块的纯函数，
//! 其余函数都只是它们的平台壳。
//!
//! 高度是**跨次保留**的：前端量完内容调 `collector_resize`，下一次热键触发仍用这个
//! 高度参与 clamp——否则每次显示都会先按默认 420 算位置、再被前端改成实际高度，
//! 窗口在贴底边时会先闪一下再跳。逻辑高度存在 `LAST_H` 里，跨显示器（不同 DPI）也
//! 不会因物理 / 逻辑换算漂移。
//!
//! 整模块经 lib.rs 的 `#[cfg(desktop)]` 只编译在桌面：手机没有全局热键，也就没有小窗。

use std::sync::Mutex;

use serde_json::json;
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, Monitor, PhysicalPosition, WebviewUrl,
    WebviewWindowBuilder,
};

/// 小窗的窗口 label。前端分流读 URL、Rust 找窗口读它，两处必须是同一个值。
pub const LABEL: &str = "collector";
/// 小窗固定宽度（逻辑像素，spec §12）。
pub const COLLECTOR_W: i32 = 380;
/// 窗口左上角相对光标的偏移（物理像素）：让指针不压住窗口左上角。
pub const CURSOR_OFFSET: (i32, i32) = (12, 18);
/// 内容再少也不缩到比这更矮（逻辑像素，spec §12 的 `[120, 工作区高]`）。
const MIN_H: f64 = 120.0;
/// 内容上限（逻辑像素）：释义特别多的词不该把窗口拉成一根细长条。
/// 超出部分由前端窗内滚动承载（CollectorRoot 的 `maxHeight: 100vh` + sticky 标题 / 底栏）。
const MAX_H: f64 = 560.0;
/// 首次显示前的高度（逻辑像素）：前端还没量过内容时用它。
const DEFAULT_H: f64 = 420.0;

/// 窗口高度的最终取值：`[MIN_H, min(MAX_H, 工作区高)]`。
///
/// 工作区比 MAX_H 还矮（小屏 / 横屏）时以工作区为准——上限的意图是「别过于细长」，
/// 不是「宁可溢出屏幕」。工作区比 MIN_H 还矮这种异常则退化成 MIN_H，保持原逻辑。
pub fn clamp_height(requested: f64, work_area_h: f64) -> f64 {
    let upper = MAX_H.min(work_area_h).max(MIN_H);
    requested.clamp(MIN_H, upper)
}

/// 最近一次的高度（逻辑像素）。`show_at_cursor` 按它算物理尺寸参与 clamp，
/// `collector_resize` 每次把 clamp 后的值写回来。
static LAST_H: Mutex<f64> = Mutex::new(DEFAULT_H);

fn last_h() -> f64 {
    LAST_H.lock().map(|h| *h).unwrap_or(DEFAULT_H)
}

fn remember_h(h: f64) {
    if let Ok(mut slot) = LAST_H.lock() {
        *slot = h;
    }
}

/// 贴光标定位的纯函数（spec §12）：左上角 = `cursor + CURSOR_OFFSET`，
/// 再交给 `clamp_position` 逐轴夹到工作区内。
///
/// `area` 是 `((min_x, min_y), (max_x, max_y))`，`size` 是窗口的**物理**尺寸——
/// 三组坐标必须在同一坐标系里（这里是物理像素），否则高 DPI 屏上会偏。
pub fn clamp_to_work_area(
    cursor: (i32, i32),
    size: (i32, i32),
    area: ((i32, i32), (i32, i32)),
) -> (i32, i32) {
    clamp_position(
        (cursor.0 + CURSOR_OFFSET.0, cursor.1 + CURSOR_OFFSET.1),
        size,
        area,
    )
}

/// 把给定的左上角逐轴 clamp 到 `[工作区左上, 工作区右下 − 窗口尺寸]`。
///
/// 光标定位（`clamp_to_work_area`）与内容变高后的重新定位（`collector_resize`）
/// 共用这一份算术——两处各写一遍迟早会漂移。
///
/// 上界取 `.max(min)`：工作区比窗口还小时退化成贴左上角，`clamp` 的两个界
/// 不能反（反了会 panic）。
pub fn clamp_position(
    top_left: (i32, i32),
    size: (i32, i32),
    area: ((i32, i32), (i32, i32)),
) -> (i32, i32) {
    let ((min_x, min_y), (max_x, max_y)) = area;
    let x = top_left.0.clamp(min_x, (max_x - size.0).max(min_x));
    let y = top_left.1.clamp(min_y, (max_y - size.1).max(min_y));
    (x, y)
}

/// 窗口的物理尺寸：逻辑高度 + 显示器缩放（DPI）一次算齐。
///
/// 缩放因子异常（≤ 0）时按 1 处理，避免除零 / 零宽窗口。
fn physical_size(scale: f64, h: f64) -> (i32, i32) {
    let scale = if scale > 0.0 { scale } else { 1.0 };
    (
        (COLLECTOR_W as f64 * scale).round() as i32,
        (h * scale).round() as i32,
    )
}

/// 预载小窗：建一次、之后一直藏着复用（`lib.rs` 的 setup 在启动时调用）。
///
/// 幂等：窗口已在时直接成功，避免 `tauri dev` 的热重载路径上重复建窗报错。
pub fn create(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(LABEL).is_some() {
        return Ok(());
    }

    WebviewWindowBuilder::new(
        app,
        LABEL,
        WebviewUrl::App("index.html?window=collector".into()),
    )
    .inner_size(COLLECTOR_W as f64, DEFAULT_H)
    .visible(false)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .resizable(false)
    .build()
    .map(|_| ())
    .map_err(|e| e.to_string())
}

/// 把窗口挪到光标旁并显示（`shortcut::read_and_deliver` 在抓取完成后调用）。
///
/// 找不到窗口 / 光标 / 显示器时**静默返回**：这条路径在后台线程里跑，
/// 一次定位失败不该 panic 掉整个进程；真正的失败会由抓取结果自己说话。
pub fn show_at_cursor(app: &AppHandle) {
    let Some(window) = app.get_webview_window(LABEL) else {
        eprintln!("[collector] 小窗尚未创建，跳过显示");
        return;
    };

    let cursor = match app.cursor_position() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[collector] 读取光标位置失败：{e}");
            return;
        }
    };

    let Some(monitor) = monitor_at(app, cursor.x, cursor.y) else {
        eprintln!("[collector] 找不到可用显示器，跳过显示");
        return;
    };

    // 工作区与光标都是物理像素；窗口尺寸要换算成物理才能参与同一套 clamp。
    let scale = monitor.scale_factor();
    let h = last_h();
    let window_size = physical_size(scale, h);
    let (x, y) = clamp_to_work_area(
        (cursor.x.round() as i32, cursor.y.round() as i32),
        window_size,
        work_area_of(&monitor),
    );

    let _ = window.set_position(PhysicalPosition::new(x, y));
    let _ = window.set_size(LogicalSize::new(COLLECTOR_W as f64, h));
    let _ = window.show();
    let _ = window.set_focus();
}

/// 隐藏小窗（失焦、重试与新一次抓取前都要先藏）。
pub fn hide(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.hide();
    }
}

/// 失焦事件的真相守卫：只有系统前台**真的换成别的窗口**才隐藏（spec §5.3「失焦即隐」）。
///
/// Windows 上点击小窗内部（标题栏、勾选框……）会把键盘焦点从顶层窗口转交 WebView2
/// 子窗口；tao 把这次顶层 `WM_KILLFOCUS` 也报成 `WindowEvent::Focused(false)`。若在该
/// 事件上直接 `hide`，用户一按下标题栏准备拖动，窗口就消失。这里用 `GetForegroundWindow`
/// 复核：前台仍是本窗口（含其子窗口、拖动中的捕获态）就不动；点了别的应用才隐藏。
///
/// 其余平台（macOS）没有这条焦点转交路径，直接隐藏。
pub fn hide_if_focus_left(app: &AppHandle) {
    #[cfg(target_os = "windows")]
    if let Some(window) = app.get_webview_window(LABEL) {
        if let Ok(hwnd) = window.hwnd() {
            // 两个 HWND 来自不同的 windows crate 版本，比较内层原始指针即可。
            let foreground = unsafe {
                windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow()
            };
            if foreground.0 == hwnd.0 {
                return;
            }
        }
    }
    hide(app);
}

/// 小窗当前是否在屏上。
///
/// 热键回调据此分流两条抓取路径（spec §5.1 / §11-1）：藏着 → 立即读；
/// 已显示 → 先藏、等焦点回到原应用，再读（`shortcut::grab_now`）。
/// 取不到窗口或查询失败一律当「不可见」——那样走的立即读路径即使读到了
/// 小窗自己的 webview 之外的内容，也不会比「藏着」更糟。
pub fn is_visible(app: &AppHandle) -> bool {
    app.get_webview_window(LABEL)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

/// 光标所在显示器；取不到时退回主显示器，都没有则 `None`。
fn monitor_at(app: &AppHandle, x: f64, y: f64) -> Option<Monitor> {
    app.monitor_from_point(x, y)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten())
}

/// `Monitor::work_area()` 是物理像素的矩形，摊成 clamp 用的两组坐标。
fn work_area_of(monitor: &Monitor) -> ((i32, i32), (i32, i32)) {
    let area = monitor.work_area();
    let (x, y) = (area.position.x, area.position.y);
    (
        (x, y),
        (x + area.size.width as i32, y + area.size.height as i32),
    )
}

/// 前端量完内容后把窗口高度调到刚好装下，并重新 clamp 位置。
///
/// 上界是**当前显示器工作区高**（逻辑像素）：物理值除以 scale 得到与 `height`
/// 同量纲的数；没有显示器信息时退回默认高度，至少不让它超过初始尺寸。
///
/// 位置（终审修复）：窗口长高后原来的左上角可能把底边顶出工作区——按**新物理高度**
/// 重新 clamp 一次。这里不用光标锚点（`clamp_to_work_area`），因为内容变高时窗口
/// 不该跳到光标旁；保持当前左上角、只把它拉回工作区内。
#[tauri::command]
pub fn collector_resize(app: AppHandle, height: f64) {
    let Some(window) = app.get_webview_window(LABEL) else {
        return;
    };
    // 量测异常（NaN / ±∞）时保持原尺寸：`clamp` 对 NaN 是透传的，不挡会在
    // `set_size` 处变成一个无效尺寸。
    if !height.is_finite() {
        return;
    }

    let monitor = window.current_monitor().ok().flatten();
    let max_h = monitor
        .as_ref()
        .map(|m| {
            let scale = m.scale_factor();
            let scale = if scale > 0.0 { scale } else { 1.0 };
            m.work_area().size.height as f64 / scale
        })
        .unwrap_or(DEFAULT_H);
    let h = clamp_height(height, max_h);

    remember_h(h);
    let _ = window.set_size(LogicalSize::new(COLLECTOR_W as f64, h));

    // 尺寸已按新高度落地，位置只做「拉回工作区」——两轴共用 `clamp_position`，
    // 与 `show_at_cursor` 的算术不会漂移。
    let Some(monitor) = monitor else {
        return;
    };
    let Ok(position) = window.outer_position() else {
        return;
    };
    let (x, y) = clamp_position(
        (position.x, position.y),
        physical_size(monitor.scale_factor(), h),
        work_area_of(&monitor),
    );
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

/// 隐藏小窗的命令壳（前端失焦兜底 / 关闭按钮调用）。
#[tauri::command]
pub fn collector_hide(app: AppHandle) {
    hide(&app);
}

/// 小窗里点「打开详情页」：唤回主窗并让它跳到该词的词典详情页。
///
/// 主窗的显示复用 `show_main_window`（含 unminimize）：小窗在屏上时主窗
/// 可能被最小化到托盘，只 `show` 不会还原。
///
/// `sentence` 只在句子模式带值（整句原文）：详情页据此显示「划词例句」条，
/// 让用户把这句话挂到所选释义的例句下——小窗里能做到的事，详情页里同样能做。
#[tauri::command]
pub fn collector_open_dict(app: AppHandle, word: String, sentence: Option<String>) {
    crate::show_main_window(&app);
    let _ = app.emit_to("main", "open-dict", json!({ "word": word, "sentence": sentence }));
}

/// 本平台是否支持划词收录：目前只有读系统选区的那两个平台。
#[tauri::command]
pub fn collector_supported() -> bool {
    cfg!(any(target_os = "windows", target_os = "macos"))
}

#[cfg(test)]
mod tests {
    use super::{clamp_position, clamp_to_work_area};

    /// 光标在右下角附近：x / y 都要往回 clamp，让窗口完整留在工作区内。
    #[test]
    fn clamps_to_right_and_bottom_edges() {
        // 光标 (1900,1000)，窗口 380x420，工作区 (0,0)-(1920,1080)
        assert_eq!(
            clamp_to_work_area((1900, 1000), (380, 420), ((0, 0), (1920, 1080))),
            (1540, 660)
        );
    }

    /// 左副屏的工作区原点为负：光标 + 偏移落在工作区内时**不得**被多余地夹住；
    /// 工作区比窗口还小时退化成工作区左上角 (0,0)，不产生负数。
    #[test]
    fn honors_negative_origin_monitor_and_tiny_work_area() {
        // 光标 (-1600 + 10, 20) + 偏移 (12, 18) = (-1578, 38)，仍在 (-1920,0)-(0,1080) 内
        assert_eq!(
            clamp_to_work_area((-1590, 20), (380, 420), ((-1920, 0), (0, 1080))),
            (-1578, 38)
        );
        // 300x300 的工作区装不下 380x420：两轴都贴工作区左上角
        assert_eq!(
            clamp_to_work_area((10, 10), (380, 420), ((0, 0), (300, 300))),
            (0, 0)
        );
    }

    /// 释义很多的词：高度封顶 `MAX_H`；正常内容原样；工作区比上限还矮时以工作区为准。
    #[test]
    fn height_caps_at_max_and_respects_floor_and_work_area() {
        assert_eq!(super::clamp_height(900.0, 1080.0), super::MAX_H);
        assert_eq!(super::clamp_height(40.0, 1080.0), super::MIN_H);
        assert_eq!(super::clamp_height(333.0, 1080.0), 333.0);
        assert_eq!(super::clamp_height(900.0, 300.0), 300.0);
    }

    /// 窗口长高后按**新**尺寸把当前位置拉回工作区：底边溢出 → 上移，右边溢出 → 左移；
    /// 已经装得下的位置一个像素都不动（终审修复的窗口重 clamp）。
    #[test]
    fn position_clamp_uses_new_size_and_leaves_fitting_window_alone() {
        // 380x650 的窗口在 (1540, 500)：底边 1150 超出 1080，上移到 y = 430。
        assert_eq!(
            clamp_position((1540, 500), (380, 650), ((0, 0), (1920, 1080))),
            (1540, 430)
        );
        // 装得下：原样返回。
        assert_eq!(
            clamp_position((100, 100), (380, 650), ((0, 0), (1920, 1080))),
            (100, 100)
        );
    }
}
