//! 安卓 TTS（Task 13）：Kotlin 桥 + Rust 轮询。
//!
//! 为什么不是 `tts` crate：它的 Android 后端要求 `rs/tts/Bridge` 这个 Java 类与
//! `ndk_context` 初始化，本仓库锁定的 tao 0.35 两样都不提供（见 `tts_stub.rs` 文件头）。
//! 这里直接用 Android 自带的 `android.speech.tts.TextToSpeech`，经 Tauri/wry 的 JNI 通道
//! 调 Kotlin 的 `TtsBridge`（`src-tauri/gen/android/app/src/main/java/com/wordsett/app/TtsBridge.kt`）。
//!
//! 通道与 `orientation.rs` 逐段相同：`window.with_webview` 取 wry 的 `JniHandle`，
//! 再用 `exec` 把闭包送回主循环线程（JNIEnv 不可跨线程）。
//!
//! **不变量（任何改动都不得违反）**：
//! 1. **任何 `exec` 闭包不得等待 `onInit`**。`onInit` 与 JNI 闭包跑在同一条主线程上，
//!    在闭包里等它 = 死锁（严重时 ANR）。Kotlin 在 `onInit` 回调里推进状态，Rust 只发一次
//!    `ensureInit`，随后用 `probeJson` 轮询结果。
//! 2. 探测在 **IPC 线程**上轮询：先 `ensureInit` 一次，然后每 `PROBE_POLL_INTERVAL`（60ms）
//!    读一次 `probeJson`，硬上限 `PROBE_TIMEOUT`（5s）；超时返回 `available:false` +
//!    原因「系统语音初始化超时」。
//! 3. `speak` 在状态非 ready 时返回 `Err`（前端的 `speakWord` 会吞掉），**绝不排队、
//!    绝不等待初始化**——否则一次朗读会把 IPC 线程按在探测路径上。
//! 4. `VoiceProbe` / `VoiceInfo` 的字段形状与桌面版逐字一致（前端契约）；
//!    `tts_english_voice_available` 永不抛错（任何失败一律 `available:false`）。
//! 5. Kotlin 不读配置文件：语速在 `rate == None` 时由本模块从 `config.rs` 解析后传入。

use std::sync::mpsc;
use std::time::{Duration, Instant};

use jni::objects::{JClass, JObject, JString, JValue};
use jni::JNIEnv;

/// Kotlin 侧类名（`Class.forName` 形式——实际经 Activity.getAppClass 取，见 `bridge_class`）。
const BRIDGE_CLASS: &str = "com.wordsett.app.TtsBridge";

/// 单次 JNI 往返的上限。`exec` 是异步投递，主线程若卡住不能把 IPC 线程永久占住。
const JNI_CALL_TIMEOUT: Duration = Duration::from_secs(5);

/// 探测轮询间隔。`onInit` 通常几十毫秒内回来，60ms 一次在 5 秒内留足余量。
const PROBE_POLL_INTERVAL: Duration = Duration::from_millis(60);

/// 探测硬上限。超出即「系统语音初始化超时」。
const PROBE_TIMEOUT: Duration = Duration::from_secs(5);

const PROBE_TIMEOUT_REASON: &str = "系统语音初始化超时";

/// 音色枚举项。字段形状与桌面版逐字一致（前端契约）。
/// 手机上恒为空列表（系统 TTS 没有可枚举的音色名），字段仅为形状对齐保留。
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceInfo {
    #[allow(dead_code)]
    name: String,
    #[allow(dead_code)]
    language: Option<String>,
}

/// 探测结果。字段形状与桌面版逐字一致（前端契约）。
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceProbe {
    available: bool,
    backend: Option<String>,
    voice: Option<String>,
    reason: Option<String>,
}

impl VoiceProbe {
    fn unavailable(reason: impl Into<String>) -> Self {
        Self {
            available: false,
            backend: None,
            voice: None,
            reason: Some(reason.into()),
        }
    }

    /// 就绪态：`backend` 固定为 `"android"`（前端用它显示「探测到了什么」）。
    fn android() -> Self {
        Self {
            available: true,
            backend: Some("android".to_string()),
            voice: None,
            reason: None,
        }
    }
}

/// 探测系统是否有可用的英文语音。
///
/// 与桌面版同一条 fail-closed 原则：**永不向上抛错**，任何失败都折成 `available:false`
/// 加原因，前端据此把听辨题与发音按钮下线。
#[tauri::command]
pub fn tts_english_voice_available(app: tauri::AppHandle) -> Result<VoiceProbe, String> {
    Ok(probe(&app))
}

/// 手机端没有可枚举的音色名（系统 TTS 只到 locale 级），返回空表。
/// 设置页据此显示「无可用音色」，`speak` 的 `voice` 参数因而不会被前端填值。
#[tauri::command]
pub fn list_english_voices() -> Result<Vec<VoiceInfo>, String> {
    Ok(Vec::new())
}

/// 朗读一段文本。
///
/// `rate` 省略时从 `shortcuts.json` 现读一次（与桌面 `speak` 同一条口径；Kotlin 不碰
/// 配置文件）。`voice` 在手机上无意义（见 `list_english_voices`），刻意忽略。
///
/// 状态非 ready 时 Kotlin 的 `speak` 只回状态 JSON、不朗读，本函数把它翻成 `Err`。
/// 这条路径**不触发初始化、不等待**：探测失败后前端仍可能因缓存状态点一次发音，
/// 让它立刻失败比把 IPC 线程按在 5 秒的初始化路径上要好。
#[tauri::command]
pub fn speak(
    app: tauri::AppHandle,
    text: String,
    rate: Option<f32>,
    voice: Option<String>,
) -> Result<(), String> {
    let _ = voice;

    let rate = rate.unwrap_or_else(|| {
        let cfg = crate::config::get();
        crate::config::f32_at(&cfg, "tts.rate", 1.0)
    });

    let jni_handle = jni_handle(&app)?;
    let (tx, rx) = mpsc::channel();
    jni_handle.exec(move |env, activity, _webview| {
        // 闭包返回 `()`，故用内层闭包包住 `?`：任何一步失败都只经 channel 交回，不 panic。
        let result = (|| -> Result<(), String> {
            clear_pending(env);
            let class = bridge_class(env, activity)?;
            let jtext = env.new_string(text).map_err(|e| e.to_string())?;

            let call = env.call_static_method(
                &class,
                "speak",
                "(Ljava/lang/String;F)Ljava/lang/String;",
                &[(&jtext).into(), JValue::Float(rate)],
            );
            // 局部引用要还：主线程的 JNI 局部引用表是共用的，反复调用会累积。
            let _ = env.delete_local_ref(jtext);
            let _ = env.delete_local_ref(class);

            let value = call.map_err(|e| {
                clear_pending(env);
                e.to_string()
            })?;
            let raw = read_java_string(env, value)?;
            let probe = crate::tts_bridge::probe_from_json(&raw)?;
            if probe.state == "ready" && probe.available {
                Ok(())
            } else {
                // 前端 `speakWord` 会吞掉 Err：这里只负责「不假装播过」。
                Err(probe
                    .reason
                    .unwrap_or_else(|| "系统语音尚未就绪".to_string()))
            }
        })();
        let _ = tx.send(result);
    });

    rx.recv_timeout(JNI_CALL_TIMEOUT)
        .map_err(|_| "朗读超时".to_string())?
}

/// 探测实现。返回 `VoiceProbe` 而非 `Result`：命令契约要求失败也走 `Ok`。
///
/// 先在 IPC 线程上发一次 `ensureInit`（立刻返回，不等 `onInit`——见文件头不变量 1），
/// 再以 60ms 为间隔轮询 `probeJson`，总预算 5 秒。`probeJson` 的每次往返另有
/// `JNI_CALL_TIMEOUT` 与「剩余预算」二者取小的上限，主线程卡死时不会越过总预算太多。
fn probe(app: &tauri::AppHandle) -> VoiceProbe {
    let started = Instant::now();

    if let Err(reason) = ensure_init(app) {
        return VoiceProbe::unavailable(reason);
    }

    let jni_handle = match jni_handle(app) {
        Ok(handle) => handle,
        Err(reason) => return VoiceProbe::unavailable(reason),
    };

    loop {
        let elapsed = started.elapsed();
        if elapsed >= PROBE_TIMEOUT {
            break;
        }

        match read_probe_json(jni_handle, (PROBE_TIMEOUT - elapsed).min(JNI_CALL_TIMEOUT)) {
            Ok(raw) => match crate::tts_bridge::probe_from_json(&raw) {
                Ok(found) if found.state == "ready" && found.available => {
                    return VoiceProbe::android();
                }
                Ok(found) if found.state == "unavailable" => {
                    return VoiceProbe::unavailable(
                        found.reason.unwrap_or_else(|| "系统语音不可用".to_string()),
                    );
                }
                // initializing：还没等到 onInit，继续轮询。
                Ok(_) => {}
                Err(e) => eprintln!("[tts] probeJson 无法解析：{e}"),
            },
            // 单次读失败（主线程忙 / 桥抛异常）不立刻判死：只要预算还在就再试。
            Err(e) => eprintln!("[tts] 读取 TTS 状态失败：{e}"),
        }

        let elapsed = started.elapsed();
        if elapsed >= PROBE_TIMEOUT {
            break;
        }
        std::thread::sleep(PROBE_POLL_INTERVAL.min(PROBE_TIMEOUT - elapsed));
    }

    VoiceProbe::unavailable(PROBE_TIMEOUT_REASON)
}

/// 触发一次 Kotlin 侧初始化并立刻返回（`exec` 闭包不等 `onInit`）。
///
/// 顺带把 Activity 作为 `Context` 交给桥：Kotlin 侧没有别的 Context 来源
/// （`android.app.ActivityThread` 不在 `android.jar` 里，编不过；也不去改生成的
/// `MainActivity`）。`attach` 幂等，每次初始化前调一次即可。
fn ensure_init(app: &tauri::AppHandle) -> Result<(), String> {
    let jni_handle = jni_handle(app)?;
    let (tx, rx) = mpsc::channel();
    jni_handle.exec(move |env, activity, _webview| {
        let result = (|| -> Result<(), String> {
            clear_pending(env);
            let class = bridge_class(env, activity)?;

            let attach = env.call_static_method(
                &class,
                "attach",
                "(Landroid/content/Context;)V",
                &[JValue::Object(activity)],
            );
            if let Err(e) = attach.map_err(|e| e.to_string()) {
                clear_pending(env);
                let _ = env.delete_local_ref(class);
                return Err(e);
            }

            // `ensureInit` 只构造 TextToSpeech 并置「初始化中」；状态推进在 onInit 回调里，
            // 这个闭包**绝不**等它（文件头不变量 1）。
            let init = env.call_static_method(&class, "ensureInit", "()V", &[]);
            let _ = env.delete_local_ref(class);
            init.map_err(|e| {
                clear_pending(env);
                e.to_string()
            })?;
            Ok(())
        })();
        let _ = tx.send(result);
    });

    rx.recv_timeout(JNI_CALL_TIMEOUT)
        .map_err(|_| "主线程未响应 TTS 初始化".to_string())?
}

/// 读一次 `TtsBridge.probeJson()`。
fn read_probe_json(jni_handle: tauri::wry::JniHandle, wait: Duration) -> Result<String, String> {
    let (tx, rx) = mpsc::channel();
    jni_handle.exec(move |env, activity, _webview| {
        let result = (|| -> Result<String, String> {
            clear_pending(env);
            let class = bridge_class(env, activity)?;
            let call = env.call_static_method(&class, "probeJson", "()Ljava/lang/String;", &[]);
            let _ = env.delete_local_ref(class);
            let value = call.map_err(|e| {
                clear_pending(env);
                e.to_string()
            })?;
            read_java_string(env, value)
        })();
        let _ = tx.send(result);
    });

    rx.recv_timeout(wait)
        .map_err(|_| "读取 TTS 状态超时".to_string())?
}

/// 取 wry 的 JNI 句柄（与 `orientation.rs` 同一段）：`with_webview` 在主线程上给出
/// `JniHandle`——它是一次性的 `Copy` 句柄，可以带回 IPC 线程。
fn jni_handle(app: &tauri::AppHandle) -> Result<tauri::wry::JniHandle, String> {
    use tauri::Manager;

    let window = app
        .get_webview_window("main")
        .or_else(|| app.webview_windows().into_values().next())
        .ok_or_else(|| "找不到可用的窗口".to_string())?;

    let (tx, rx) = mpsc::channel();
    window
        .with_webview(move |webview| {
            let _ = tx.send(webview.jni_handle());
        })
        .map_err(|e| e.to_string())?;
    rx.recv_timeout(JNI_CALL_TIMEOUT)
        .map_err(|_| "取 JNI 句柄超时".to_string())
}

/// 取 `TtsBridge` 的 `JClass`。
///
/// 不用 `env.find_class("com/wordsett/app/TtsBridge")`：`exec` 闭包跑在主线程缓存的
/// `JNIEnv` 上，那里的 `FindClass` 走系统类加载器、找不到应用自己的类。wry 自己的
/// `find_class` 也是经 Activity 的 `getAppClass`（`Class.forName`）走应用类加载器，
/// 这里照抄同一条路。
fn bridge_class<'a>(env: &mut JNIEnv<'a>, activity: &JObject<'_>) -> Result<JClass<'a>, String> {
    let name = env.new_string(BRIDGE_CLASS).map_err(|e| e.to_string())?;
    let call = env.call_method(
        activity,
        "getAppClass",
        "(Ljava/lang/String;)Ljava/lang/Class;",
        &[(&name).into()],
    );
    let _ = env.delete_local_ref(name);
    let value = call.map_err(|e| {
        clear_pending(env);
        e.to_string()
    })?;
    let class = value.l().map_err(|e| e.to_string())?;
    Ok(class.into())
}

/// 把 `call_static_method` 返回的 `java.lang.String` 转成 Rust `String`。
///
/// 调用方负责先确认返回的是对象；类型不对时 `get_string` 会报错。局部引用在这里还掉。
fn read_java_string(
    env: &mut JNIEnv<'_>,
    value: jni::objects::JValueOwned<'_>,
) -> Result<String, String> {
    let object = value.l().map_err(|e| e.to_string())?;
    let jstring = JString::from(object);
    let text = env.get_string(&jstring).map(|s| s.to_string_lossy().to_string());
    let _ = env.delete_local_ref(jstring);
    text.map_err(|e| {
        clear_pending(env);
        e.to_string()
    })
}

/// 清掉挂起异常（如果有）。失败不上报：调用点已经在失败路径上，再叠一个错误没有信息量。
///
/// 每次 JNI 调用前都清一次：上一次调用留下的挂起异常会让本次 `call_*` 直接被拒。
/// 出错后也清一次：异常留在线程上会污染同一线程后续所有 JNI 调用。
fn clear_pending(env: &mut JNIEnv<'_>) {
    if let Ok(true) = env.exception_check() {
        let _ = env.exception_clear();
    }
}
