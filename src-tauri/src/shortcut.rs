//! 全局热键与抓取流水线（v0.7.9 划词收录）。
//!
//! 分两层：
//! - **纯逻辑**（各平台都编译）：accelerator 校验、平台默认值、注册/注销抽象、
//!   改键回滚与「成功才落盘」。宿主机 `cargo test` 跑的就是这一层。
//! - **桌面接线**（整段 `#[cfg(desktop)]`）：真实注册器（`tauri-plugin-global-shortcut`）、
//!   `register_all` 与命令（`set_shortcut` / `take_startup_error` / `take_grab_log` /
//!   `grab_now` / `collector_ready`），以及一次抓取的完整流水线 `run_grab`。
//!   Android 构建里插件 crate 根本不存在，这一段不能参与编译。
//!
//! accelerator 的形状以 `global-hotkey` 的解析器为准（`HotKey::from_str`）：
//! 修饰键 + 恰好一个主键，`+` 分隔。校验只做形状判断，不碰任何平台 API。

/// 平台默认热键：Windows 用 `Alt+KeyW`，macOS 用 `Option+KeyW`。
///
/// 与前端 `lib/hotkey.ts` 的 `GRAB_WORD_DEFAULT_*` 是同一组值（Task 16 接线）；
/// 不一致会让「恢复默认」把用户带到另一个键上。
#[cfg(target_os = "macos")]
pub fn default_accelerator() -> &'static str {
    "Option+KeyW"
}

#[cfg(not(target_os = "macos"))]
pub fn default_accelerator() -> &'static str {
    "Alt+KeyW"
}

/// 修饰键归一化后的规范名。`Option` 归到 `Alt`（macOS 习惯写法），`Meta` 归到
/// `Super`——两者在 accelerator 语义里是同一个键，重复判定必须看得见这一点。
fn normalize_modifier(upper: &str) -> Option<&'static str> {
    match upper {
        "CONTROL" => Some("CONTROL"),
        "ALT" | "OPTION" => Some("ALT"),
        "SHIFT" => Some("SHIFT"),
        "SUPER" | "META" => Some("SUPER"),
        _ => None,
    }
}

/// 具名主键白名单：与 `global-hotkey` 0.8 的 `parse_key` 同形（比较前统一大写）。
///
/// 不收录单字符别名（`A` / `0` / `UP` 等）——前端录制只产出 `KeyboardEvent.code`
/// （`KeyA` / `Digit0` / `ArrowUp`），白名单跟着 `code` 走更窄也更稳。
/// `MEDIANEXTTRACK` / `MEDIAPREVIOUSTRACK` 是旧版 global-hotkey 的拼写，0.8 已改成
/// `MEDIATRACKNEXT` / `MEDIATRACKPREV`；两者都放行，历史配置不会因此变成「被占用」。
const NAMED_KEYS: [&str; 50] = [
    // 标点
    "BACKQUOTE",
    "BACKSLASH",
    "BRACKETLEFT",
    "BRACKETRIGHT",
    "COMMA",
    "EQUAL",
    "MINUS",
    "PERIOD",
    "QUOTE",
    "SEMICOLON",
    "SLASH",
    // 编辑 / 导航
    "BACKSPACE",
    "CAPSLOCK",
    "ENTER",
    "SPACE",
    "TAB",
    "DELETE",
    "END",
    "HOME",
    "INSERT",
    "PAGEDOWN",
    "PAGEUP",
    "PRINTSCREEN",
    "SCROLLLOCK",
    "PAUSE",
    "ARROWDOWN",
    "ARROWLEFT",
    "ARROWRIGHT",
    "ARROWUP",
    "ESCAPE",
    "NUMLOCK",
    // 小键盘（数字键 Numpad0..9 由形状规则覆盖）
    "NUMPADADD",
    "NUMPADDECIMAL",
    "NUMPADDIVIDE",
    "NUMPADENTER",
    "NUMPADEQUAL",
    "NUMPADMULTIPLY",
    "NUMPADSUBTRACT",
    // 媒体 / 音量
    "AUDIOVOLUMEDOWN",
    "AUDIOVOLUMEUP",
    "AUDIOVOLUMEMUTE",
    "MEDIAPLAY",
    "MEDIAPAUSE",
    "MEDIAPLAYPAUSE",
    "MEDIASTOP",
    "MEDIATRACKNEXT",
    "MEDIATRACKPREV",
    "MEDIATRACKPREVIOUS",
    "MEDIANEXTTRACK",
    "MEDIAPREVIOUSTRACK",
];

/// 校验 accelerator 形状：至少一个修饰键（无重复）、恰好一个主键、主键在支持范围内。
///
/// 只做形状判断——键是否真的能注册由平台决定（`ShortcutRegistrar::register`）。
/// 错误文案面向设置页直接显示，用中文短句。
pub fn validate(accel: &str) -> Result<(), String> {
    let mut modifiers: Vec<&'static str> = Vec::new();
    let mut has_main = false;

    for raw in accel.split('+') {
        let token = raw.trim();
        if token.is_empty() {
            return Err("快捷键不能为空".to_string());
        }
        let upper = token.to_ascii_uppercase();

        if let Some(canonical) = normalize_modifier(&upper) {
            if modifiers.contains(&canonical) {
                return Err(format!("修饰键重复：{token}"));
            }
            modifiers.push(canonical);
            continue;
        }

        if has_main {
            return Err(format!("只能有一个主键：{token}"));
        }
        if !is_supported_main_key(&upper) {
            return Err(format!("不支持的主键：{token}"));
        }
        has_main = true;
    }

    if modifiers.is_empty() {
        return Err("至少需要一个修饰键（Control / Alt / Shift / Super）".to_string());
    }
    if !has_main {
        return Err("缺少主键".to_string());
    }
    Ok(())
}

/// 主键形状：`Key[A-Z]`、`Digit[0-9]`、`Numpad[0-9]`、`F1..F24` 或具名白名单。
/// 入参必须已是大写。
fn is_supported_main_key(key: &str) -> bool {
    if let Some(rest) = key.strip_prefix("KEY") {
        return rest.len() == 1 && rest.as_bytes()[0].is_ascii_uppercase();
    }
    if let Some(rest) = key.strip_prefix("DIGIT") {
        return rest.len() == 1 && rest.as_bytes()[0].is_ascii_digit();
    }
    if let Some(rest) = key.strip_prefix("NUMPAD") {
        // NUMPAD0..9 由形状覆盖；NUMPADADD 这类具名键落到下面的白名单。
        if rest.len() == 1 && rest.as_bytes()[0].is_ascii_digit() {
            return true;
        }
    }
    if let Some(rest) = key.strip_prefix('F') {
        // 只认规范写法 F1..F24：F01 / F0 之类解析器不收，校验也不该放行。
        if rest.bytes().all(|b| b.is_ascii_digit()) {
            if let Ok(n) = rest.parse::<u32>() {
                if (1..=24).contains(&n) && n.to_string() == rest {
                    return true;
                }
            }
        }
        return false;
    }
    NAMED_KEYS.contains(&key)
}

/// 注册 / 注销的抽象。生产实现包 `tauri-plugin-global-shortcut`（见下方桌面接线段），
/// 测试用 `MockRegistrar` 记录调用顺序并模拟「被占用」。
pub trait ShortcutRegistrar {
    fn register(&self, accel: &str) -> Result<(), String>;
    fn unregister(&self, accel: &str) -> Result<(), String>;
}

/// 改键：校验新键 → 注销旧键 → 注册新键；新键注册失败时**把旧键装回去**。
///
/// 顺序不可换：先注册新键再注销旧键，会在同一个 accelerator 上撞到「已注册」；
/// 注册失败后若不回滚，用户会从一个可用热键变成完全没有热键。
///
/// 回滚失败只记日志、不改变返回的错误——用户需要处理的是「新键被占用」，
/// 回滚失败是启动级错误，由 `take_startup_error` 负责呈现。
pub fn set_shortcut_impl<R: ShortcutRegistrar>(
    reg: &R,
    current: &str,
    next: &str,
) -> Result<(), String> {
    validate(next)?;

    if let Err(e) = reg.unregister(current) {
        return Err(format!("无法注销当前快捷键：{e}"));
    }

    match reg.register(next) {
        Ok(()) => Ok(()),
        Err(e) => {
            eprintln!("[shortcut] 注册 {next} 失败：{e}");
            if let Err(rollback) = reg.register(current) {
                eprintln!("[shortcut] 回滚注册旧快捷键 {current} 也失败：{rollback}");
            }
            Err("该组合键可能已被其他应用占用，请换一个".to_string())
        }
    }
}

/// 改键的完整事务：换键 → 成功才落盘（spec §6.1 / §11-7 的「配置值保持不变」）。
///
/// `save` 由调用方注入（生产是 `config::set_patch`，测试是内存里的 `SaveSpy`）——
/// 这样「注册失败时零次落盘」这条不变量不需要碰磁盘也能钉住。
///
/// 落盘失败时把旧键装回去：否则运行中的热键是新键、重启后却回到旧键，
/// 界面显示与真实行为会分叉。回滚本身失败只记日志，由命令层升级成启动级错误。
// 移动端没有热键概念，`apply_shortcut` 的唯一生产调用点是桌面命令表；
// 纯逻辑链（validate → set_shortcut_impl → apply_shortcut）仍各平台编译，
// 宿主机测试要跑它。故只在非桌面构建上压掉这条「从未使用」。
#[cfg_attr(not(desktop), allow(dead_code))]
pub fn apply_shortcut<R, S>(reg: &R, current: &str, next: &str, save: S) -> Result<(), String>
where
    R: ShortcutRegistrar,
    S: FnOnce(&str) -> Result<(), String>,
{
    // 注册失败时 save 根本不会被执行（这是「失败不落盘」的实现处）。
    set_shortcut_impl(reg, current, next)?;

    if let Err(e) = save(next) {
        if let Err(rollback) = reg.unregister(next).and_then(|()| reg.register(current)) {
            eprintln!("[shortcut] 保存失败后恢复旧快捷键 {current} 也失败：{rollback}");
        }
        return Err(format!("快捷键保存失败：{e}"));
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// 桌面接线：真实注册器、启动注册、命令与抓取流水线（v0.7.9 Task 6）。
//
// 整段 `#[cfg(desktop)]`：`tauri-plugin-global-shortcut` 的 crate 在 Android/iOS 上
// 根本不存在（crate 顶层 `#![cfg(not(any(target_os = "android", target_os = "ios")))]`），
// 无条件引用会让手机构建直接失败。上面那层纯逻辑各平台照常编译（宿主机测试要用）。
// ---------------------------------------------------------------------------

/// 配置文件里划词热键的分区 / 键名。读（`str_at` 的点分路径）与写（`set_patch`
/// 的嵌套对象）都从这里取值——两处各写一份字符串迟早会漂移。
#[cfg(desktop)]
const GRAB_WORD_SECTION: &str = "actions";
#[cfg(desktop)]
const GRAB_WORD_KEY: &str = "grab_word";
/// `set_shortcut` 的动作名（spec §7）。当前与配置键同名，故直接取同一个常量。
#[cfg(desktop)]
const ACTION_GRAB_WORD: &str = GRAB_WORD_KEY;
/// 读选区的超时预算（spec §5.1）。
#[cfg(desktop)]
const READ_TIMEOUT: std::time::Duration = std::time::Duration::from_millis(500);
/// 「小窗已在显示」路径的焦点归还等待（spec §5.1 / §11-1）。只走 `grab_now`，
/// 热键首次触发（小窗藏着）不等这 120ms。
#[cfg(desktop)]
const FOCUS_RETURN_DELAY: std::time::Duration = std::time::Duration::from_millis(120);

/// 启动级错误（注册失败 / 旧键恢复失败）。`take_startup_error` 取走后清空——
/// 主窗顶部提示条只应出现一次（spec §5.6）。
#[cfg(desktop)]
static STARTUP_ERROR: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);
/// 尚未投递成功的最近一次抓取结果，供小窗挂载时握手（`collector_ready`）。
/// `read_and_deliver` 在 `emit_to` 成功后清空它——握手只补「事件没送到」，
/// 已投递过的结果不再在 webview 重挂载时重放。
#[cfg(desktop)]
static PENDING: std::sync::Mutex<Option<crate::grab::GrabOutcome>> =
    std::sync::Mutex::new(None);
/// 最近 5 条抓取日志（设置页诊断行）。
#[cfg(desktop)]
static LOG: std::sync::Mutex<crate::grab::GrabLog> =
    std::sync::Mutex::new(crate::grab::GrabLog::new());
/// 抓取代际。自增分配，旧代结果在回程处被丢弃（spec §5.1-1）。
#[cfg(desktop)]
static GRAB_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// 生产注册器：包 `tauri-plugin-global-shortcut`。
#[cfg(desktop)]
struct PluginRegistrar<'a> {
    app: &'a tauri::AppHandle,
}

#[cfg(desktop)]
impl ShortcutRegistrar for PluginRegistrar<'_> {
    fn register(&self, accel: &str) -> Result<(), String> {
        register_hotkey(self.app, accel)
    }

    fn unregister(&self, accel: &str) -> Result<(), String> {
        use tauri_plugin_global_shortcut::GlobalShortcutExt;

        let shortcuts = self.app.global_shortcut();
        // 启动时注册失败（被占用）或已被外部注销时，插件里根本没有这个键，
        // 系统注销会返回 Err。此时「注销」应当是无操作——否则用户永远改不掉
        // 一个注册失败的键（spec §9「被占用可在设置改键」）。
        if !shortcuts.is_registered(accel) {
            return Ok(());
        }
        shortcuts.unregister(accel).map_err(|e| e.to_string())
    }
}

/// 注册一个 accelerator 并挂上抓取回调。
#[cfg(desktop)]
fn register_hotkey(app: &tauri::AppHandle, accel: &str) -> Result<(), String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

    app.global_shortcut()
        .on_shortcut(accel, |app, _shortcut, event| {
            // 按下与抬起都会回调；只认按下边沿（spec §5.1-1）。
            if event.state == ShortcutState::Pressed {
                on_hotkey(app);
            }
        })
        .map_err(|e| e.to_string())
}

/// 热键按下的分流（spec §5.1 / §11-1）：
/// - 小窗藏着：立即读（`run_grab`），读完再显示——正常路径。
/// - 小窗已显示：先藏、等焦点回到原应用、再读（`grab_now`）——否则读到的是小窗自己。
#[cfg(desktop)]
fn on_hotkey(app: &tauri::AppHandle) {
    if crate::collector::is_visible(app) {
        let _ = grab_now(app.clone());
    } else {
        run_grab(app);
    }
}

/// 当前配置的热键（注册失败时配置值保持原样，所以它也是「上次成功注册」的值）。
#[cfg(desktop)]
fn configured_accelerator() -> String {
    let path = format!("{GRAB_WORD_SECTION}.{GRAB_WORD_KEY}");
    crate::config::str_at(&crate::config::get(), &path)
        .unwrap_or_else(|| default_accelerator().to_string())
}

#[cfg(desktop)]
fn record_startup_error(message: String) {
    if let Ok(mut slot) = STARTUP_ERROR.lock() {
        *slot = Some(message);
    }
}

/// 启动注册（setup 调用）。失败只记错误、不 panic（spec §5.6）。
#[cfg(desktop)]
pub fn register_all(app: &tauri::AppHandle) -> Result<(), String> {
    let accel = configured_accelerator();
    PluginRegistrar { app }.register(&accel).map_err(|e| {
        let message = format!("划词热键注册失败（可能被其他应用占用），可在设置中修改：{e}");
        record_startup_error(message.clone());
        message
    })
}

/// 改键命令（前端不发插件权限，全部经这里，spec §7）。
///
/// 只有 `apply_shortcut` 成功（新键真的注册上）才落盘 `actions.grab_word`；
/// 注册失败时配置与缓存原样不动（spec §6.1 / §11-7）。
#[cfg(desktop)]
#[tauri::command]
pub fn set_shortcut(
    app: tauri::AppHandle,
    action: String,
    accelerator: String,
) -> Result<(), String> {
    use serde_json::json;
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    if action != ACTION_GRAB_WORD {
        return Err(format!("未知的快捷键动作：{action}"));
    }

    let current = configured_accelerator();
    let reg = PluginRegistrar { app: &app };

    let result = apply_shortcut(&reg, &current, &accelerator, |next| {
        // 只写这一个键（分区 / 键名与读取共用同一组常量）；深合并保留其余配置
        // （config 不变量 1）。
        crate::config::set_patch(json!({
            (GRAB_WORD_SECTION): { (GRAB_WORD_KEY): next }
        }))
        .map(|_| ())
    });

    // 新键被占用且旧键也没装回去：运行时已没有可用热键，升级成启动级错误
    // （spec §6.1 末段）。校验失败、或旧键已恢复时不会进这里。
    if result.is_err() && !app.global_shortcut().is_registered(current.as_str()) {
        let message = format!("原快捷键 {current} 未能恢复，请重新设置划词热键");
        eprintln!("[shortcut] {message}");
        record_startup_error(message);
    }

    result
}

/// 取走启动级错误（主窗顶部提示条，一次性）。
#[cfg(desktop)]
#[tauri::command]
pub fn take_startup_error() -> Option<String> {
    STARTUP_ERROR.lock().ok().and_then(|mut slot| slot.take())
}

/// 最近 5 条抓取日志，最新在前（设置页诊断行，spec §7）。
#[cfg(desktop)]
#[tauri::command]
pub fn take_grab_log() -> Vec<crate::grab::GrabLogEntry> {
    LOG.lock().map(|log| log.entries()).unwrap_or_default()
}

/// 小窗挂载时握手取走最近一次结果（spec §7）。
#[cfg(desktop)]
#[tauri::command]
pub fn collector_ready() -> Option<crate::grab::GrabOutcome> {
    PENDING.lock().ok().and_then(|mut slot| slot.take())
}

/// 热键首次触发路径：藏窗（防御）→ 后台读选区 → 存 pending + 记日志 → 显示 → 投递。
#[cfg(desktop)]
pub fn run_grab(app: &tauri::AppHandle) {
    // 代际必须在**触发时**分配：若放到工作线程里取号，线程调度会先于按下次序决定
    // 谁是「新」的一次，旧的一次可能拿到更大的 id，从而通过回程的丢弃检查、
    // 覆盖 pending 并重新显示（spec §5.1-1 的「丢弃旧代结果」）。
    let grab_id = next_grab_id();

    // 绝不在小窗自己可见时读选区（焦点在它自己的 webview 上）。正常路径窗口
    // 本来就藏着，这里的 hide 只是防御，不等待——120ms 只属于 `grab_now`。
    crate::collector::hide(app);
    let app = app.clone();
    std::thread::spawn(move || read_and_deliver(&app, grab_id));
}

/// 「重试」与「小窗已显示时再次触发」：藏窗 → 等焦点回到原应用 → 走同一条读取/显示路径。
#[cfg(desktop)]
#[tauri::command]
pub fn grab_now(app: tauri::AppHandle) -> Result<(), String> {
    // 同上：取号先于 120ms 等待，按下次序即代际次序。
    let grab_id = next_grab_id();
    crate::collector::hide(&app);
    std::thread::spawn(move || {
        std::thread::sleep(FOCUS_RETURN_DELAY);
        read_and_deliver(&app, grab_id);
    });
    Ok(())
}

/// 分配下一代抓取 id（1 起）。
#[cfg(desktop)]
fn next_grab_id() -> u64 {
    GRAB_ID.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1
}

/// 后台线程里的读取与投递（spec §5.1）。
#[cfg(desktop)]
fn read_and_deliver(app: &tauri::AppHandle, grab_id: u64) {
    use std::sync::atomic::Ordering;
    use tauri::Emitter;

    // 开工前已被更新的一次抓取取代：连读都不要读——此时小窗可能已经由新的那次
    // 显示出来，读到的会是它自己的 webview（spec §5.1 / 评审决定 2 的绝对禁令）。
    if GRAB_ID.load(Ordering::SeqCst) != grab_id {
        return;
    }

    let outcome = crate::grab::normalize_empty(crate::grab::outcome_for(
        grab_id,
        crate::selection::read_with(crate::selection::read_selection, READ_TIMEOUT),
    ));

    // 旧代结果直接丢弃：读选区期间用户又按了一次热键，以小窗最终显示的那次为准。
    if GRAB_ID.load(Ordering::SeqCst) != grab_id {
        return;
    }

    if let Ok(mut slot) = PENDING.lock() {
        *slot = Some(outcome.clone());
    }
    if let Ok(mut log) = LOG.lock() {
        log.push(log_entry(&outcome));
    }

    // 先投递、再显示（终审修复）：小窗是隐藏复用窗口，webview 在隐藏时照常收事件。
    // 先 emit 让前端在窗口可见前就换成新卡片，否则复用窗口会先闪一帧上一张卡。
    // 投递成功后立即清掉 pending：握手只补偿「事件没送到」的那一次，已投递过的结果
    // 不应在 webview 重挂载时被重放（同一代重复投递仍由前端按 grabId 去重）。
    match app.emit_to(crate::collector::LABEL, "collector-grab", &outcome) {
        Ok(()) => {
            if let Ok(mut slot) = PENDING.lock() {
                *slot = None;
            }
        }
        Err(e) => eprintln!("[shortcut] 抓取结果投递失败：{e}"),
    }
    crate::collector::show_at_cursor(app);
}

/// 一次抓取 → 一条诊断日志（spec §5.6：成功记模式与文本摘要，失败记类目文案）。
#[cfg(desktop)]
fn log_entry(outcome: &crate::grab::GrabOutcome) -> crate::grab::GrabLogEntry {
    crate::grab::GrabLogEntry {
        time: now_hms(),
        mode: Some(outcome.mode.to_string()),
        summary: match &outcome.error {
            // too_long / os 的 detail 已经是一句完整文案（含 token 数 / 系统错误详情）。
            Some(error) if !error.detail.is_empty() => error.detail.clone(),
            Some(error) => error_label(&error.kind),
            None => truncate_summary(&outcome.text),
        },
        error_kind: outcome.error.as_ref().map(|error| error.kind.clone()),
    }
}

/// 失败类目的用户可读文案。`SelectionError::detail()` 对这几类返回空串，
/// 文案由消费方按 kind 决定——Rust 侧只有这条诊断日志需要它。
#[cfg(desktop)]
fn error_label(kind: &str) -> String {
    match kind {
        "empty" => "未检测到选中文本".to_string(),
        "unsupported" => "当前应用不支持读取选区".to_string(),
        "denied" => "系统拒绝读取选区（macOS 需授予辅助功能权限）".to_string(),
        "timeout" => "读取选区超时".to_string(),
        "too_long" => "选区过长".to_string(),
        other => format!("系统错误（{other}）"),
    }
}

/// 文本摘要：超过 24 个字符截断并加省略号（日志一行放得下）。
#[cfg(desktop)]
fn truncate_summary(text: &str) -> String {
    const MAX_CHARS: usize = 24;
    if text.chars().count() <= MAX_CHARS {
        return text.to_string();
    }
    let head: String = text.chars().take(MAX_CHARS).collect();
    format!("{head}…")
}

/// 日志时间戳 `HH:MM:SS`（本地时区；设置页原样显示）。只用系统 API，不引新依赖。
#[cfg(desktop)]
fn now_hms() -> String {
    let (h, m, s) = local_hms();
    format!("{h:02}:{m:02}:{s:02}")
}

#[cfg(all(desktop, target_os = "windows"))]
fn local_hms() -> (u32, u32, u32) {
    // `SYSTEMTIME` 已带本地时区，正是设置页要显示的时间。
    let t = unsafe { windows::Win32::System::SystemInformation::GetLocalTime() };
    (t.wHour as u32, t.wMinute as u32, t.wSecond as u32)
}

#[cfg(all(desktop, target_os = "macos"))]
fn local_hms() -> (u32, u32, u32) {
    use core_foundation::date::CFDate;
    use core_foundation::timezone::CFTimeZone;

    // CFDate::now() 是 CFAbsoluteTime（2001-01-01 UTC 起的秒数），本函数只取
    // 「今天的哪一秒」；UTC 秒 + 时区偏移即本地墙钟时间。
    let offset = CFTimeZone::system().seconds_from_gmt(CFDate::now()) as i64;
    let utc = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let local = (utc + offset).rem_euclid(86_400);
    ((local / 3_600) as u32, ((local % 3_600) / 60) as u32, (local % 60) as u32)
}

/// 其余桌面平台（Linux）没有本地时间绑定；本就没有选区读取实现（`Unsupported`），
/// 日志退回 UTC 只影响诊断显示。
#[cfg(all(desktop, not(any(target_os = "windows", target_os = "macos"))))]
fn local_hms() -> (u32, u32, u32) {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    (
        ((secs / 3_600) % 24) as u32,
        ((secs % 3_600) / 60) as u32,
        (secs % 60) as u32,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::rc::Rc;

    /// 仅测试用：把每次调用记成 `"register:<accel>"` / `"unregister:<accel>"`，
    /// 并让某个 accelerator 的注册必定失败（模拟被其它应用占用）。
    struct MockRegistrar {
        calls: Rc<RefCell<Vec<String>>>,
        failing: Option<String>,
    }

    impl ShortcutRegistrar for MockRegistrar {
        fn register(&self, accel: &str) -> Result<(), String> {
            self.calls.borrow_mut().push(format!("register:{accel}"));
            if self.failing.as_deref() == Some(accel) {
                Err("hotkey already registered".to_string())
            } else {
                Ok(())
            }
        }

        fn unregister(&self, accel: &str) -> Result<(), String> {
            self.calls.borrow_mut().push(format!("unregister:{accel}"));
            Ok(())
        }
    }

    fn mock() -> (MockRegistrar, std::rc::Rc<std::cell::RefCell<Vec<String>>>) {
        let calls = Rc::new(RefCell::new(Vec::new()));
        (
            MockRegistrar {
                calls: Rc::clone(&calls),
                failing: None,
            },
            calls,
        )
    }

    fn mock_with_failing_register(
        accel: &str,
    ) -> (MockRegistrar, std::rc::Rc<std::cell::RefCell<Vec<String>>>) {
        let calls = Rc::new(RefCell::new(Vec::new()));
        (
            MockRegistrar {
                calls: Rc::clone(&calls),
                failing: Some(accel.to_string()),
            },
            calls,
        )
    }

    #[test]
    fn validate_accepts_default_forms() {
        assert!(validate("Alt+KeyW").is_ok());
        assert!(validate("Option+KeyW").is_ok());
        assert!(validate("Control+Shift+KeyK").is_ok());
        assert!(validate("Super+Digit1").is_ok());
    }

    #[test]
    fn validate_rejects_no_or_duplicate_modifier() {
        assert!(validate("KeyW").is_err());
        assert!(validate("Alt+Alt+KeyW").is_err());
        assert!(validate("Alt").is_err());
    }

    #[test]
    fn validate_rejects_unknown_or_multiple_main_keys() {
        assert!(validate("Alt+IntlBackslash").is_err());
        assert!(validate("Alt+KeyA+KeyB").is_err());
        assert!(validate("Alt+F25").is_err());
    }

    #[test]
    fn set_shortcut_reregisters_old_when_new_fails() {
        let (reg, calls) = mock_with_failing_register("Control+KeyK");
        let err = set_shortcut_impl(&reg, "Alt+KeyW", "Control+KeyK").unwrap_err();
        assert!(err.contains("占用"), "错误文案应说明被占用：{err}");
        assert_eq!(
            *calls.borrow(),
            vec![
                "unregister:Alt+KeyW",
                "register:Control+KeyK",
                "register:Alt+KeyW",
            ]
        );
    }

    /// 主键白名单：与 global-hotkey 解析器同形的具名键都要能过，大小写不敏感。
    #[test]
    fn validate_accepts_named_keys_and_ignores_case() {
        for accel in [
            "Control+Comma",
            "Alt+Period",
            "Control+Slash",
            "Alt+Backquote",
            "Control+Enter",
            "Alt+Space",
            "Shift+ArrowUp",
            "Control+ArrowDown",
            "Alt+ArrowLeft",
            "Super+ArrowRight",
            "Control+NumpadAdd",
            "Alt+NumpadSubtract",
            "Super+NumpadMultiply",
            "Control+NumpadDivide",
            "Alt+NumpadDecimal",
            "Control+MediaPlayPause",
            "Shift+MediaStop",
            "Control+MediaTrackNext",
            "Alt+MediaTrackPrevious",
            "Control+F24",
            "Alt+F1",
            "Super+Numpad9",
            "alt+keyw",
        ] {
            assert!(validate(accel).is_ok(), "{accel} 应被接受");
        }
    }

    #[test]
    fn validate_rejects_malformed_shapes() {
        for accel in [
            "",
            "Alt+",
            "Alt++KeyW",
            "Alt+F01",
            "Alt+KeyAB",
            "Alt+5",     // 解析器只认 Digit5，不认裸数字
            "Option+Alt+KeyW", // 归一化后是重复的 Alt
        ] {
            assert!(validate(accel).is_err(), "{accel} 应被拒绝");
        }
    }

    #[test]
    fn default_accelerator_is_platform_specific_and_valid() {
        #[cfg(target_os = "macos")]
        assert_eq!(default_accelerator(), "Option+KeyW");
        #[cfg(not(target_os = "macos"))]
        assert_eq!(default_accelerator(), "Alt+KeyW");
        assert!(
            validate(default_accelerator()).is_ok(),
            "平台默认值必须能通过自己的校验"
        );
    }

    #[test]
    fn set_shortcut_swaps_when_new_registration_succeeds() {
        let (reg, calls) = mock();
        set_shortcut_impl(&reg, "Alt+KeyW", "Control+Shift+KeyK").expect("改键应成功");
        assert_eq!(
            *calls.borrow(),
            vec!["unregister:Alt+KeyW", "register:Control+Shift+KeyK"]
        );
    }

    /// 新键不合法时必须**先**失败：不能先把旧键注销掉，再发现新键根本不能用。
    #[test]
    fn set_shortcut_validates_before_touching_registrar() {
        let (reg, calls) = mock();
        assert!(set_shortcut_impl(&reg, "Alt+KeyW", "KeyW").is_err());
        assert!(calls.borrow().is_empty(), "校验失败时不得动注册器");
    }

    /// spec §6.1 / §11-7：注册失败时配置值必须原样不动。
    /// 用 `SaveSpy`（一次闭包调用记一条）代替真实落盘——本用例不碰磁盘。
    #[test]
    fn failed_new_accelerator_keeps_config_value() {
        let (reg, calls) = mock_with_failing_register("Control+KeyK");
        let saves = RefCell::new(Vec::<String>::new());

        let err = apply_shortcut(&reg, "Alt+KeyW", "Control+KeyK", |next| {
            saves.borrow_mut().push(next.to_string());
            Ok(())
        })
        .unwrap_err();

        assert!(err.contains("占用"), "错误文案应说明被占用：{err}");
        assert!(
            saves.borrow().is_empty(),
            "注册失败时不得写配置，实际写了：{:?}",
            saves.borrow()
        );
        // 旧键必须被装回去（与 set_shortcut_impl 的既有契约一致）
        assert_eq!(
            *calls.borrow(),
            vec![
                "unregister:Alt+KeyW",
                "register:Control+KeyK",
                "register:Alt+KeyW",
            ]
        );
    }

    /// 成功路径：先换键、再把新值交给 save，且只交一次。
    #[test]
    fn successful_change_saves_new_accelerator_once() {
        let (reg, calls) = mock();
        let mut saved: Option<String> = None;

        apply_shortcut(&reg, "Alt+KeyW", "Control+Shift+KeyK", |next| {
            saved = Some(next.to_string());
            Ok(())
        })
        .expect("改键应成功");

        assert_eq!(saved.as_deref(), Some("Control+Shift+KeyK"));
        assert_eq!(
            *calls.borrow(),
            vec!["unregister:Alt+KeyW", "register:Control+Shift+KeyK"]
        );
    }

    /// 注册成功但落盘失败：把旧键装回去，运行时与配置文件保持同一份事实。
    #[test]
    fn save_failure_restores_old_accelerator() {
        let (reg, calls) = mock();

        let err = apply_shortcut(&reg, "Alt+KeyW", "Control+Shift+KeyK", |_| {
            Err("磁盘只读".to_string())
        })
        .unwrap_err();

        assert!(err.contains("保存失败"), "错误文案应说明保存失败：{err}");
        assert_eq!(
            *calls.borrow(),
            vec![
                "unregister:Alt+KeyW",
                "register:Control+Shift+KeyK",
                "unregister:Control+Shift+KeyK",
                "register:Alt+KeyW",
            ]
        );
    }
}
