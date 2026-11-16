//! 全局热键（v0.7.9 划词收录）。
//!
//! 本模块只放**纯逻辑**：accelerator 校验、平台默认值、注册/注销的抽象与改键回滚。
//! 真实注册（`tauri-plugin-global-shortcut`）与抓取流水线在 Task 6 接入，整段会
//! `#[cfg(desktop)]`——这里的纯函数部分各平台都编译（Android 构建也要过 `cargo check`）。
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
// Task 6 接线前生产代码还没有调用点（单测已覆盖），先压掉 dead_code 噪音；接线后删除。
#[allow(dead_code)]
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

/// 注册 / 注销的抽象。生产实现包 `tauri-plugin-global-shortcut`（Task 6），
/// 测试用 `MockRegistrar` 记录调用顺序并模拟「被占用」。
// Task 6 接线前生产代码还没有调用点（单测已覆盖），先压掉 dead_code 噪音；接线后删除。
#[allow(dead_code)]
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
/// 回滚失败是启动级错误，由 Task 6 的 `take_startup_error` 负责呈现。
// Task 6 接线前生产代码还没有调用点（单测已覆盖），先压掉 dead_code 噪音；接线后删除。
#[allow(dead_code)]
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
}
