//! 一次抓取的**结果契约**与诊断日志（v0.7.9 划词收录，Task 2）。
//!
//! `GrabOutcome` 是 Rust → 前端的事件 / 命令载荷，字段名是跨语言契约的一部分
//! （spec §7：`{ grabId, mode, text, tokens, error }`，`rename_all = "camelCase"`
//! 不得删改）。`GrabLog` 是设置页「最近一次抓取」的环形日志：最多 5 条、最新在前。
//!
//! 平台无关：读选区在 Task 3/4，流水线（pending + emit）在 Task 6。

use crate::selection::{analyze, SelectionError, TextMode};
use std::collections::VecDeque;

/// 诊断日志容量（spec §7 的 `take_grab_log` 返回最近 5 条）。
const LOG_CAPACITY: usize = 5;

/// 一次抓取的结果（spec §7）。
///
/// `mode` 只有三种取值：`"word"` / `"sentence"` / `"error"`；`error` 为 `None` 时
/// `mode` 一定是前两者。「选区过长」失败态**仍保留清洗后的全文**（前端要显示
/// 「N 个词」的原句）；读取类失败（empty / timeout / os…）没有文本，`text` 为空串。
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrabOutcome {
    pub grab_id: u64,
    pub mode: &'static str,
    pub text: String,
    pub tokens: usize,
    pub error: Option<GrabError>,
}

/// 失败类目 + 详情。`kind` 取值见 `SelectionError::kind()` 与 `"too_long"`
/// （spec §7 的 `error.kind` 联合类型）。
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrabError {
    pub kind: String,
    pub detail: String,
}

/// 设置页诊断行的一条记录（spec §7 的 `take_grab_log`）。
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrabLogEntry {
    pub time: String,
    pub mode: Option<String>,
    pub summary: String,
    pub error_kind: Option<String>,
}

/// 把一次读取的结果映射成前端契约（spec §5.1 / §5.2）。
///
/// - `Err(e)` → `mode: "error"`，`error` = 该类目的 kind / detail，`text` 为空。
/// - `Ok` 且超长 → `mode: "error"`、`error.kind = "too_long"`，**`text` 保留全文**、
///   `tokens` 是真实数（前端显示「选区过长（N 个词）」）。
/// - 其余 `Ok` → `"word"` / `"sentence"`，`error: None`。
// Task 6 接线前生产代码还没有调用点（单测已覆盖），先压掉 dead_code 噪音；接线后删除。
#[allow(dead_code)]
pub fn outcome_for(grab_id: u64, result: Result<String, SelectionError>) -> GrabOutcome {
    match result {
        Err(error) => GrabOutcome {
            grab_id,
            mode: "error",
            text: String::new(),
            tokens: 0,
            error: Some(GrabError {
                kind: error.kind().to_string(),
                detail: error.detail().to_string(),
            }),
        },
        Ok(raw) => {
            let analyzed = analyze(&raw);
            if analyzed.too_long {
                GrabOutcome {
                    grab_id,
                    mode: "error",
                    tokens: analyzed.tokens,
                    text: analyzed.text,
                    error: Some(GrabError {
                        kind: "too_long".to_string(),
                        detail: format!("选区过长（{} 个词），请缩小选区", analyzed.tokens),
                    }),
                }
            } else {
                GrabOutcome {
                    grab_id,
                    mode: match analyzed.mode {
                        TextMode::Word => "word",
                        TextMode::Sentence => "sentence",
                    },
                    text: analyzed.text,
                    tokens: analyzed.tokens,
                    error: None,
                }
            }
        }
    }
}

/// 最近抓取的环形日志：`push` 进最新一条，超过 5 条丢最旧的；`entries()` 最新在前。
#[derive(Debug, Default)]
pub struct GrabLog {
    entries: VecDeque<GrabLogEntry>,
}

// Task 6 接线前生产代码还没有调用点（单测已覆盖），先压掉 dead_code 噪音；接线后删除。
#[allow(dead_code)]
impl GrabLog {
    pub fn push(&mut self, entry: GrabLogEntry) {
        // 先入最新、再截断：等到 push 之后再 truncate，丢弃的永远是队尾（最旧）那条。
        self.entries.push_front(entry);
        self.entries.truncate(LOG_CAPACITY);
    }

    /// 最新在前（设置页从上往下读就是时间倒序）。
    pub fn entries(&self) -> Vec<GrabLogEntry> {
        self.entries.iter().cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn outcome_maps_errors_to_kinds() {
        let o = outcome_for(7, Err(SelectionError::Empty));
        assert_eq!(o.grab_id, 7);
        assert_eq!(o.error.unwrap().kind, "empty");
        let ok = outcome_for(8, Ok("ephemeral".into()));
        assert_eq!(ok.mode, "word");
        assert!(ok.error.is_none());
        let too = outcome_for(
            9,
            Ok((1..=31)
                .map(|i| format!("w{i}"))
                .collect::<Vec<_>>()
                .join(" ")),
        );
        assert_eq!(too.error.unwrap().kind, "too_long");
    }

    #[test]
    fn grab_log_keeps_newest_five() {
        let mut log = GrabLog::default();
        for i in 0..7 {
            log.push(GrabLogEntry {
                time: format!("t{i}"),
                mode: Some("word".into()),
                summary: "x".into(),
                error_kind: None,
            });
        }
        let e = log.entries();
        assert_eq!(e.len(), 5);
        assert_eq!(e[0].time, "t6");
        assert_eq!(e[4].time, "t2");
    }

    /// 句子模式映射 + 超长态保留全文与真实 token 数（spec §5.2）。
    #[test]
    fn outcome_maps_sentence_and_too_long_payload() {
        let s = outcome_for(
            1,
            Ok("The ephemeral beauty of cherry blossoms fades within days.".into()),
        );
        assert_eq!(s.mode, "sentence");
        assert_eq!(s.tokens, 9);
        assert!(s.error.is_none());

        let too = outcome_for(
            2,
            Ok((1..=31)
                .map(|i| format!("w{i}"))
                .collect::<Vec<_>>()
                .join(" ")),
        );
        assert_eq!(too.mode, "error");
        assert_eq!(too.tokens, 31);
        assert_eq!(
            too.text,
            (1..=31)
                .map(|i| format!("w{i}"))
                .collect::<Vec<_>>()
                .join(" ")
        );
        let err = too.error.expect("超长必须带 error");
        assert_eq!(err.kind, "too_long");
        assert!(err.detail.contains("31"), "详情应带上 token 数：{err:?}");
    }

    /// 跨语言契约：前端读 `grabId` / `error.kind` / `errorKind`，
    /// 删掉 `rename_all = "camelCase"` 会让前端读到 undefined。
    #[test]
    fn grab_types_serialize_camel_case() {
        let v = serde_json::to_value(outcome_for(7, Err(SelectionError::Empty))).unwrap();
        assert!(v.get("grabId").is_some(), "缺 grabId：{v}");
        assert!(v.get("grab_id").is_none(), "仍带 snake_case：{v}");
        assert!(v["error"]["kind"].is_string(), "缺 error.kind：{v}");

        let entry = GrabLogEntry {
            time: "t".into(),
            mode: Some("word".into()),
            summary: "x".into(),
            error_kind: Some("empty".into()),
        };
        let v = serde_json::to_value(entry).unwrap();
        assert!(v.get("errorKind").is_some(), "缺 errorKind：{v}");
        assert!(v.get("error_kind").is_none(), "仍带 snake_case：{v}");
    }

    /// 空日志返回空 Vec（设置页首次打开时没有记录）。
    #[test]
    fn grab_log_starts_empty() {
        assert!(GrabLog::default().entries().is_empty());
    }
}
