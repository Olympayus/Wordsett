//! 真机诊断通道（v0.8.0 Task 1）：日志插件落盘、前端错误转发与「关于」页日志读取。
//!
//! 日志文件由 `tauri_plugin_log` 的 `LogDir` target 决定（`app_log_dir()/wordsett.log`）：
//! Rust 侧 `log::error!` 与前端经 `log_frontend_error` 转发的异常汇入同一份文件。
//! 本模块只负责读尾部与写入前端转发，日志目录的创建与滚动都归插件。

use tauri::Manager;

/// 取日志文件尾部最多 `max` 行（v0.8.0 Task 1）。
///
/// 规则：按行切分、**去掉尾部空行**、保留最后 `max` 行；`max == 0` 直接返回空。
/// 空行按「trim 后为空」判定——Windows 日志是 CRLF，`str::lines` 已剥离 `\r`，
/// 再去一次空白可容下只有空格的残行。前导空行不删（那是文件真实内容的一部分）。
pub fn tail_lines(text: &str, max: usize) -> Vec<String> {
    if max == 0 {
        return Vec::new();
    }
    let mut lines: Vec<String> = text.lines().map(str::to_string).collect();
    while lines.last().is_some_and(|line| line.trim().is_empty()) {
        lines.pop();
    }
    let start = lines.len().saturating_sub(max);
    lines.split_off(start)
}

/// 前端未捕获异常转发（v0.8.0 Task 1）。`level` 只认 `info` / `warn`，
/// 其余（含空串与未知值）一律按 `error` 处理——宁可多记一条，不能把崩溃降级成提示。
/// 消息前加 `[web]`，与 Rust 侧日志同一文件里可区分来源。
#[tauri::command]
pub fn log_frontend_error(level: String, message: String) {
    match level.as_str() {
        "info" => log::info!("[web] {message}"),
        "warn" => log::warn!("[web] {message}"),
        _ => log::error!("[web] {message}"),
    }
}

/// 读最近日志（v0.8.0 Task 1）：「关于」页的日志浮层用。
///
/// 路径与 `tauri_plugin_log` 的 `LogDir` target 同源（`app_log_dir()/wordsett.log`），
/// 不在本模块拼第二份目录规则。文件不存在是正常状态（还没写过任何日志），
/// 返回空串而不是报错，界面据此显示「暂无日志」。
/// `max_lines` 夹到 `[1, 2000]`：下界 0 会让浮层显示空串、上界防止一次读进超大文件。
#[tauri::command]
pub async fn read_recent_logs(app: tauri::AppHandle, max_lines: usize) -> Result<String, String> {
    let path = app
        .path()
        .app_log_dir()
        .map_err(|e| e.to_string())?
        .join("wordsett.log");

    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(String::new()),
        Err(e) => return Err(e.to_string()),
    };

    Ok(tail_lines(&text, max_lines.clamp(1, 2000)).join("\n"))
}

#[cfg(test)]
mod tests {
    use super::tail_lines;

    #[test]
    fn keeps_last_n_lines() {
        assert_eq!(tail_lines("a\nb\nc\nd", 2), vec!["c", "d"]);
    }

    #[test]
    fn fewer_lines_than_max_returns_all() {
        assert_eq!(tail_lines("a\nb", 5), vec!["a", "b"]);
    }

    #[test]
    fn zero_max_returns_empty() {
        assert!(tail_lines("a\nb", 0).is_empty());
    }

    #[test]
    fn drops_trailing_blank_lines() {
        assert_eq!(tail_lines("a\nb\n\n", 5), vec!["a", "b"]);
    }
}
