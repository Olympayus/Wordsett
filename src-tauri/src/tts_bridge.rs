//! TTS 桥的 JSON 解析（Task 13）。
//!
//! Kotlin 的 `TtsBridge` 只回一份 JSON：`{"state":…,"available":…,"reason":…}`。
//! **解析放在这里、不带任何 cfg**：安卓专用的 `tts_android.rs` 在宿主机上永远编译不到，
//! 若把解析一起塞进去，等于这条跨语言契约在本环境没有任何测试。故本模块永远参与编译，
//! 单测在 Windows 上的 `cargo test` 里直接跑。
//!
//! 三条不变量：
//! 1. `state` 只能是 `ready` / `initializing` / `unavailable` 三者之一，其余一律 `Err`
//!    —— 认错状态会让 Rust 侧把「初始化中」当成可用、朗读静默失败。
//! 2. JSON 必须能完整反序列化（三个字段一个不能少、类型必须对），否则 `Err`。
//! 3. 本模块不做任何 IO、不认识 Android——它只认识这串字节。
//!
//! `#![allow(dead_code)]`：桌面构建里本模块没有调用点（唯一调用方 `tts_android.rs`
//! 是 android 专属），但上面的理由要求它永远参与编译。测试本身也算使用，只是非 test
//! 构建会报「从未使用」——这条 allow 只覆盖本模块，不扩大范围。

#![allow(dead_code)]

use serde::Deserialize;

/// Kotlin 桥回传的探测状态。字段名与线上 JSON 一致（非 camelCase，Kotlin 侧手写）。
#[derive(Debug, Deserialize)]
pub struct BridgeProbe {
    pub state: String,
    pub available: bool,
    pub reason: Option<String>,
}

/// 解析 `TtsBridge.probeJson()` / `TtsBridge.speak()` 的返回值。
///
/// 只做两件事：反序列化、校验状态枚举。语义一致性（`ready` ⇒ `available`）由调用方
/// 自己判——这里只保证「这串字节属于本协议」。
pub fn probe_from_json(raw: &str) -> Result<BridgeProbe, String> {
    let probe: BridgeProbe = serde_json::from_str(raw)
        .map_err(|e| format!("TTS 桥返回的 JSON 无法解析：{e}"))?;
    match probe.state.as_str() {
        "ready" | "initializing" | "unavailable" => Ok(probe),
        other => Err(format!("TTS 桥返回了未知状态「{other}」")),
    }
}

#[cfg(test)]
mod tests {
    use super::probe_from_json;

    #[test]
    fn parses_ready_probe() {
        let p = probe_from_json(r#"{"state":"ready","available":true,"reason":null}"#).unwrap();
        assert!(p.available);
        assert_eq!(p.state, "ready");
        assert!(p.reason.is_none());
    }

    #[test]
    fn parses_initializing_probe() {
        let p =
            probe_from_json(r#"{"state":"initializing","available":false,"reason":"初始化中"}"#)
                .unwrap();
        assert!(!p.available);
        assert_eq!(p.reason.as_deref(), Some("初始化中"));
    }

    #[test]
    fn rejects_malformed_json() {
        assert!(probe_from_json("not json").is_err());
    }

    /// 状态枚举之外的值（拼错、未来新增而 Rust 未跟上）必须被拒——
    /// 否则「initialising」会被当成未知态静默放行。
    #[test]
    fn rejects_unknown_state() {
        let err = probe_from_json(r#"{"state":"initialising","available":false,"reason":null}"#);
        assert!(err.is_err());
        assert!(
            err.unwrap_err().contains("initialising"),
            "错误文案要带出那个认不出的状态，便于对照 Kotlin 侧"
        );
    }
}
