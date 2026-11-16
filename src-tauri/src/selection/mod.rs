//! 选区抓取的**平台无关**层（v0.7.9 划词收录，Task 2）。
//!
//! 三件事：清洗与 token 化（`strip_selection` / `tokens`）、模式判定（`analyze`）、
//! 带超时的读取包装（`read_with`）。平台实现在 `selection/win.rs`（Windows UIA，Task 3）
//! 与 `selection/mac.rs`（macOS 辅助功能 / AX，Task 4）；本文件只做平台分发，不碰任何
//! 平台 API，也不含 Tauri 命令。
//!
//! 模式判定（spec §5.2）：token 数 1 → 单词；2–30 → 句子；>30 → 句子 + `too_long`。
//! 超长**不截断**：`text` 保留清洗后的全文，前端据此显示「选区过长（N 个词）」。

use std::sync::mpsc;
use std::time::Duration;

// 平台分发：Windows 走 UI Automation（Task 3），macOS 走辅助功能 / AX（Task 4，盲写）。
// 同名函数由 `shortcut::run_grab` 经 `read_with` 调用。
#[cfg(target_os = "windows")]
mod win;
#[cfg(target_os = "windows")]
pub use win::read_selection;

#[cfg(target_os = "macos")]
mod mac;
#[cfg(target_os = "macos")]
pub use mac::read_selection;

/// Windows 与 macOS 之外的桌面平台（Linux）没有选区读取实现，统一返回 `Unsupported`。
/// 手机端整条流水线不参与编译（lib.rs 的 `#[cfg(desktop)] mod selection;`），
/// 这个兜底只为其余桌面构建能通过编译。
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn read_selection() -> Result<String, SelectionError> {
    Err(SelectionError::Unsupported)
}

/// 读取选区失败的类目。`kind()` 的返回值是跨语言契约的一部分
/// （spec §7 的 `error.kind`），改名即破坏前端映射。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SelectionError {
    /// 确有选区接口，但当前没有选中文本。
    Empty,
    /// 前台控件不暴露文本选区接口（终端、自绘控件等）。
    Unsupported,
    /// 系统拒绝访问（macOS 未授予辅助功能权限）。
    Denied,
    /// 读取超时（预算由 `read_with` 的调用方决定，生产是 500ms）。
    Timeout,
    /// 其它系统错误，原样携带详情供设置页诊断行显示。
    Os(String),
}

impl SelectionError {
    /// 失败类目（前端按它选文案，spec §7）。
    pub fn kind(&self) -> &'static str {
        match self {
            Self::Empty => "empty",
            Self::Unsupported => "unsupported",
            Self::Denied => "denied",
            Self::Timeout => "timeout",
            Self::Os(_) => "os",
        }
    }

    /// 失败详情：只有 `Os` 携带文本；其余类目的文案由前端按 `kind` 决定，
    /// 这里返回空串（`detail` 字段照旧出现在契约里，不会是 null）。
    pub fn detail(&self) -> &str {
        match self {
            Self::Os(message) => message,
            _ => "",
        }
    }
}

/// 清洗选区：trim + 把换行 / 制表 / 连续空白折叠成单个空格（spec §5.1）。
pub fn strip_selection(raw: &str) -> String {
    raw.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// 切 token：以「非字母数字、且不是词内 `'` / `-`」的字符为分隔（空格与中英文标点
/// 都落在这一类），首尾的 `'` / `-` 去掉，空串丢弃。
///
/// 切之前先把弯撇号 `’` / `‘`（U+2019 / U+2018，Word / Office 自动更正的产物）
/// 归一成直撇号 `'`：否则 `don’t` 会被切成 `don` + `t`，一个单词被误判成句子，
/// 查库也命不中 ecdict（它的词头用直撇号）。归一后 `'` 照旧是词内字符，两端引号
/// 由下面的 `trim_matches` 剥掉。
///
/// 大小写保留原文——查库的小写归一化在 providers 层，不在这里做（spec §5.1）。
pub fn tokens(text: &str) -> Vec<String> {
    text.replace('‘', "'").replace('’', "'")
        .split(|c: char| !c.is_alphanumeric() && c != '\'' && c != '-')
        .map(|piece| piece.trim_matches(|c: char| c == '\'' || c == '-'))
        .filter(|piece| !piece.is_empty())
        .map(str::to_string)
        .collect()
}

/// 选区模式（前端 contract 的 `mode` 由它映射成 `"word"` / `"sentence"`）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TextMode {
    Word,
    Sentence,
}

/// `analyze` 的产物：模式 + 清洗后的文本 + token 数 + 是否超长。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Analyzed {
    pub mode: TextMode,
    pub text: String,
    pub tokens: usize,
    pub too_long: bool,
}

/// 判定选区模式（spec §5.2）：1 token → 单词；2–30 → 句子；>30 → 句子 + `too_long`。
///
/// 单词模式下 `text` 取那个 token（首尾标点 / 引号已在 `tokens` 里剥掉，
/// spec §5.1「单词模式剥除首尾标点与引号」）；句子模式保留清洗后的全文。
pub fn analyze(raw: &str) -> Analyzed {
    let cleaned = strip_selection(raw);
    let words = tokens(&cleaned);
    let count = words.len();

    match count {
        // 0 个 token（纯标点 / 空白选区）归入单词模式、text 为空——
        // 「确无选中文本」的 Empty 由读取层判定，这里不越权。
        0 => Analyzed {
            mode: TextMode::Word,
            text: String::new(),
            tokens: 0,
            too_long: false,
        },
        1 => Analyzed {
            mode: TextMode::Word,
            text: words.into_iter().next().unwrap_or_default(),
            tokens: 1,
            too_long: false,
        },
        n if n <= 30 => Analyzed {
            mode: TextMode::Sentence,
            text: cleaned,
            tokens: n,
            too_long: false,
        },
        n => Analyzed {
            mode: TextMode::Sentence,
            text: cleaned,
            tokens: n,
            too_long: true,
        },
    }
}

/// 在后台线程跑一次读取，最多等 `timeout`；超时返回 `Timeout`（spec §5.1 的 500ms 预算）。
///
/// 超时后不 join 线程——读选区的系统调用可能卡在目标应用里，让它在后台自然结束，
/// 结果随 channel 一起丢弃（Task 6 用 grabId 丢弃旧代结果，不依赖这里取消）。
pub fn read_with<R>(reader: R, timeout: Duration) -> Result<String, SelectionError>
where
    R: FnOnce() -> Result<String, SelectionError> + Send + 'static,
{
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let _ = tx.send(reader());
    });

    // `recv_timeout` 的 Disconnected（线程 panic 未发结果）也按超时处理：
    // 两者对调用方是同一件事——本次没拿到文本，让用户重试。
    match rx.recv_timeout(timeout) {
        Ok(result) => result,
        Err(_) => Err(SelectionError::Timeout),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokens_split_on_punctuation_but_keep_inner_marks() {
        assert_eq!(tokens("Hello, world!"), vec!["Hello", "world"]);
        assert_eq!(
            tokens("don't stop — it's well-known."),
            vec!["don't", "stop", "it's", "well-known"]
        );
        assert_eq!(tokens("  。，！  "), Vec::<String>::new());
    }

    /// 弯撇号（Word / Office 自动更正）按词内直撇号处理：一个单词不得裂成两个 token。
    /// 归一后的 `'` 也让查库能命中 ecdict 的直撇号词头。
    #[test]
    fn tokens_normalize_curly_apostrophes() {
        assert_eq!(tokens("don’t stop"), vec!["don't", "stop"]);
        // 弯单引号包裹的单词：两端引号归一后照旧被剥掉。
        assert_eq!(tokens("‘ephemeral’"), vec!["ephemeral"]);
    }

    #[test]
    fn analyze_classifies_word_sentence_and_too_long() {
        assert!(matches!(analyze("ephemeral").mode, TextMode::Word));
        let s = analyze("The ephemeral beauty of cherry blossoms fades within days.");
        assert!(matches!(s.mode, TextMode::Sentence));
        assert!(!s.too_long);
        let long = analyze(
            &(1..=31)
                .map(|i| format!("w{i}"))
                .collect::<Vec<_>>()
                .join(" "),
        );
        assert!(long.too_long && long.tokens == 31);
    }

    #[test]
    fn read_with_times_out() {
        let r = read_with(
            || {
                std::thread::sleep(Duration::from_millis(200));
                Ok("x".into())
            },
            Duration::from_millis(20),
        );
        assert!(matches!(r, Err(SelectionError::Timeout)));
    }

    /// trim + 空白折叠（spec §5.1 清洗规则）。
    #[test]
    fn strip_selection_trims_and_collapses_whitespace() {
        assert_eq!(strip_selection("  hello\n\tworld  "), "hello world");
        assert_eq!(strip_selection("\n\n  "), "");
    }

    /// 单词模式剥除首尾标点与引号（spec §5.1）。
    #[test]
    fn analyze_word_mode_strips_edge_punctuation() {
        let a = analyze("  “ephemeral,”  ");
        assert!(matches!(a.mode, TextMode::Word));
        assert_eq!(a.text, "ephemeral");
        assert_eq!(a.tokens, 1);
        assert!(!a.too_long);
    }

    /// 读取成功且未超时：原样拿到读取结果。
    #[test]
    fn read_with_returns_reader_result() {
        let r = read_with(|| Ok("ephemeral".into()), Duration::from_millis(500));
        assert_eq!(r, Ok("ephemeral".to_string()));
    }

    /// 读取器的错误原样透出（不被包装成 Timeout）。
    #[test]
    fn read_with_passes_reader_error_through() {
        let r = read_with(|| Err(SelectionError::Denied), Duration::from_millis(500));
        assert!(matches!(r, Err(SelectionError::Denied)));
    }
}
