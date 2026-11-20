//! TTS 桥的 JSON 解析与语速映射（Android Task 13 / iOS Task 14）。
//!
//! Kotlin 的 `TtsBridge` 只回一份 JSON：`{"state":…,"available":…,"reason":…}`。
//! iOS 的 Swift 桥沿用同一份契约，另加 `av_rate` 这条跨语言语速曲线。
//! **解析与映射放在这里、不带任何 cfg**：安卓专用的 `tts_android.rs` 与 iOS 专用的
//! `tts_ios.rs` 在宿主机上永远编译不到，若把契约一起塞进去，等于这些跨语言契约在本环境
//! 没有任何测试。故本模块永远参与编译，单测在 Windows 上的 `cargo test` 里直接跑。
//!
//! 三条不变量：
//! 1. `state` 只能是 `ready` / `initializing` / `unavailable` 三者之一，其余一律 `Err`
//!    —— 认错状态会让 Rust 侧把「初始化中」当成可用、朗读静默失败。
//! 2. JSON 必须能完整反序列化（三个字段一个不能少、类型必须对），否则 `Err`。
//! 3. 本模块不做任何 IO、不认识任何平台——它只认识这串字节与这条语速曲线。
//!
//! `#![allow(dead_code)]`：桌面构建里本模块没有调用点（调用方 `tts_android.rs` /
//! `tts_ios.rs` 都是手机专属），但上面的理由要求它永远参与编译。测试本身也算使用，
//! 只是非 test 构建会报「从未使用」——这条 allow 只覆盖本模块，不扩大范围。

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

/// 应用语速（0.5–2.0，1.0 = 常速）→ `AVSpeechUtteranceRate`（0.0–1.0，系统默认 0.5）。
///
/// 整条曲线就是一次线性缩放：`av = 0.5 × rate`，再夹到 `[0.1, 1.0]`。选择它而不是
/// 让 Swift 侧自己做，是因为「什么算常速」是跨语言契约的一部分——把它放在永远参与
/// 编译的本模块里，Windows 上的 `cargo test` 就能钉住这条曲线（`tts_ios.rs` 在宿主
/// 机上编不到）。
///
/// 越界静默夹住：`rate` 来自用户可直接编辑的 `shortcuts.json`，读到 10.0 不能 panic，
/// 也不能让 AVFoundation 收到 >1.0 的值。
pub fn av_rate(rate: f32) -> f32 {
    (0.5 * rate).clamp(0.1, 1.0)
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

    /// 应用语速 1.0（常速）必须落在 AVSpeechUtteranceRate 的默认值 0.5 上——
    /// 这是 iOS 与桌面/SAPI 的「常速」对齐点，偏一点都会让用户觉得换了语速。
    #[test]
    fn av_rate_centers_on_system_default() {
        assert!((super::av_rate(1.0) - 0.5).abs() < f32::EPSILON);
    }

    /// 越界静默夹住（rate 来自用户可直接编辑的配置文件），且曲线单调：
    /// 应用语速越快，交给系统的值越大。
    #[test]
    fn av_rate_is_clamped_and_monotonic() {
        assert!((super::av_rate(0.5) - 0.25).abs() < f32::EPSILON);
        assert!((super::av_rate(2.0) - 1.0).abs() < f32::EPSILON);
        assert!((super::av_rate(10.0) - 1.0).abs() < f32::EPSILON);
        assert!(super::av_rate(0.6) < super::av_rate(1.2));
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
