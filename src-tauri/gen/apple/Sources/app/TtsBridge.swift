// Wordsett iOS 原生桥（Task 15 TTS / Task 19 状态栏）。
//
// 这个文件是生成工程里的手工补丁：重新生成 `gen/apple` 后必须补回，并在
// `project.pbxproj` 里挂进 Sources 编译阶段（清单见 CLAUDE.md）。
//
// 与 Rust 侧（`src-tauri/src/tts_ios.rs`）的两条硬约束：
//   1. Rust 从 blocking 线程池并发进入 FFI，状态必须线程安全（严格走下面的锁）；
//   2. `AVSpeechSynthesizer` 只在主队列创建 / 朗读；FFI 调用立即返回，绝不等待朗读结束。
//
// 内存契约：status / voices 用 `strdup` 交出字符串，Rust 读完立刻经
// `wordsett_tts_free` 释放——分配与释放必须都在 Swift 侧（跨模块分配器是未定义行为）。

import AVFoundation
import UIKit

@objc final class TtsBridge: NSObject {
    static let shared = TtsBridge()

    /// 保护下面三个字段。Rust 会从多个 blocking 线程并发读状态；
    /// `synth` 的创建与使用只在主队列，但字段本身仍统一走这把锁。
    private let lock = NSLock()
    private var state = "initializing"
    private var reason: String?
    private var synth: AVSpeechSynthesizer?

    // MARK: - 状态

    /// 惰性初始化：创建 synthesizer 并把状态推到 ready / unavailable。
    ///
    /// `status` 由 Rust 的 blocking 线程同步调用（5 秒探测预算），所以这里可以
    /// `DispatchQueue.main.sync` 等初始化落地；`Thread.isMainThread` 分支只是防御——
    /// 若将来有人从主线程进来，main.sync 会死锁。
    private func ensureInitialized() {
        lock.lock()
        let initialized = synth != nil
        lock.unlock()
        if initialized { return }

        if Thread.isMainThread {
            initialize()
        } else {
            DispatchQueue.main.sync { self.initialize() }
        }
    }

    /// 只允许在主队列执行；重复进入是安全的（第二个调用直接返回）。
    private func initialize() {
        lock.lock()
        defer { lock.unlock() }
        guard synth == nil else { return }

        synth = AVSpeechSynthesizer()
        let hasEnglish = AVSpeechSynthesisVoice.speechVoices().contains {
            $0.language.lowercased().hasPrefix("en")
        }
        if hasEnglish {
            state = "ready"
            reason = nil
        } else {
            state = "unavailable"
            reason = "系统未安装英文语音"
        }
    }

    /// `{"state":"ready|initializing|unavailable","available":bool,"reason":string|null}`
    ///
    /// `reason` 键**永远存在**（无原因时为 null）：Rust 的 `BridgeProbe` 字段契约里
    /// 三个键缺一不可，缺键会解析失败、探测直接判死。
    func statusJSON() -> String {
        ensureInitialized()

        lock.lock()
        let state = self.state
        let reason = self.reason
        lock.unlock()

        let payload: [String: Any] = [
            "state": state,
            "available": state == "ready",
            "reason": reason ?? NSNull(),
        ]
        return jsonString(payload) ?? "{\"state\":\"unavailable\",\"available\":false,\"reason\":\"状态序列化失败\"}"
    }

    /// `[{"name":identifier,"language":BCP-47}]`，只含英文音色。
    func voicesJSON() -> String {
        ensureInitialized()

        let infos: [[String: Any]] = AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language.lowercased().hasPrefix("en") }
            .map { ["name": $0.identifier, "language": $0.language] }
        return jsonString(infos) ?? "[]"
    }

    // MARK: - 朗读

    /// 0 = 已投递；非 0 = 未就绪（绝不排队、绝不等待初始化）。
    /// `rate` 已由 Rust 的 `av_rate` 映射到 AVSpeechUtterance 的 0.1–1.0。
    func speak(_ text: String, rate: Float, voiceIdentifier: String?) -> Int32 {
        ensureInitialized()

        lock.lock()
        let ready = state == "ready"
        lock.unlock()
        guard ready else { return 1 }

        let clamped = max(0.0, min(1.0, rate))
        DispatchQueue.main.async {
            self.lock.lock()
            let synth = self.synth
            self.lock.unlock()
            guard let synth = synth else { return }

            // 与 Android 一致：连点时只念后一个，新朗读打断旧朗读。
            if synth.isSpeaking {
                synth.stopSpeaking(at: .immediate)
            }

            let utterance = AVSpeechUtterance(string: text)
            utterance.rate = clamped
            // voice_id == nil 时用系统默认英文音色（spec §7.6）。
            if let id = voiceIdentifier, let voice = AVSpeechSynthesisVoice(identifier: id) {
                utterance.voice = voice
            } else if let fallback = AVSpeechSynthesisVoice(language: "en-US") {
                utterance.voice = fallback
            }
            synth.speak(utterance)
        }
        return 0
    }

    func stop() {
        DispatchQueue.main.async {
            self.lock.lock()
            let synth = self.synth
            self.lock.unlock()
            synth?.stopSpeaking(at: .immediate)
        }
    }

    private func jsonString(_ object: Any) -> String? {
        guard let data = try? JSONSerialization.data(withJSONObject: object) else { return nil }
        return String(data: data, encoding: .utf8)
    }
}

// MARK: - C ABI（符号名与 tts_ios.rs 的 extern 逐字对齐，改名即链接失败）

@_cdecl("wordsett_tts_status")
public func wordsettTtsStatus() -> UnsafeMutablePointer<CChar>? {
    return strdup(TtsBridge.shared.statusJSON())
}

@_cdecl("wordsett_tts_voices")
public func wordsettTtsVoices() -> UnsafeMutablePointer<CChar>? {
    return strdup(TtsBridge.shared.voicesJSON())
}

@_cdecl("wordsett_tts_speak")
public func wordsettTtsSpeak(
    _ text: UnsafePointer<CChar>?,
    _ rate: Float,
    _ voiceId: UnsafePointer<CChar>?
) -> Int32 {
    guard let text = text else { return 2 }
    let content = String(cString: text)
    let voice = voiceId.map { String(cString: $0) }
    return TtsBridge.shared.speak(content, rate: rate, voiceIdentifier: voice)
}

@_cdecl("wordsett_tts_stop")
public func wordsettTtsStop() {
    TtsBridge.shared.stop()
}

@_cdecl("wordsett_tts_free")
public func wordsettTtsFree(_ ptr: UnsafeMutablePointer<CChar>?) {
    free(ptr)
}

// MARK: - 状态栏（Task 19，失败静默 / 可降级）

/// 设置窗口的 `overrideUserInterfaceStyle`，让状态栏图标跟随应用主题。
/// 工作在主队列异步落地；任何失败都无从上报，系统默认样式继续生效。
@_cdecl("wordsett_set_status_bar_style")
public func wordsettSetStatusBarStyle(_ dark: Bool) {
    DispatchQueue.main.async {
        let style: UIUserInterfaceStyle = dark ? .dark : .light
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .forEach { window in
                window.overrideUserInterfaceStyle = style
                window.rootViewController?.setNeedsStatusBarAppearanceUpdate()
            }
    }
}
