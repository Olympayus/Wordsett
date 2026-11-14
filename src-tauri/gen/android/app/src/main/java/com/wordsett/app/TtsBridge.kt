package com.wordsett.app

import android.content.Context
import android.speech.tts.TextToSpeech
import androidx.annotation.Keep
import java.util.Locale

/**
 * 系统 TTS 的 Kotlin 桥（Task 13）。
 *
 * 与 Rust 侧 `tts_android.rs` 文件头同一组不变量：
 * 1. **任何 JNI 入口都不得等待 `onInit`**——`onInit` 与 JNI 调用同在 Android 主线程，
 *    阻塞等待即死锁（严重时 ANR）。状态由 `onInit` 回调推进，Rust 侧轮询 `probeJson` 读取。
 * 2. 对外只有三个状态：initializing / ready / unavailable；内部 idle 归入 initializing。
 * 3. `speak` 只在 ready 时朗读；非 ready 立刻返回同形状 JSON，**不排队、不等待**。
 * 4. 本类不读配置文件：语速由 Rust 解析后从 `speak(text, rate)` 传入。
 *
 * Context 由 Rust 在 `ensureInit` 之前经 `attach(Context)` 传入（wry 的 JNI 闭包手里有
 * Activity）。不用 `android.app.ActivityThread`：它不在公开 SDK 的 `android.jar` 里，
 * 直接引用编不过、反射调用在 targetSdk 36 上会被 hidden-API 策略拦下。
 * 这样生成的 `MainActivity` 保持零改动。
 *
 * `@Keep`：release 构建开了 R8（`isMinifyEnabled = true`），本类只被 JNI 的
 * `Class.forName` 按名字引用、Kotlin 侧没有任何调用点。注意 AGP 8.11 的默认规则
 * **不认** androidx 版 Keep（只认 support 版），故 `proguard-rules.pro` 里另有一行
 * `-keep @androidx.annotation.Keep class * {*;}`——两处缺一，release 包里就只剩
 * 一个空类（debug 正常、正式包 TTS 静默失效）。
 */
@Keep
object TtsBridge {
  private const val STATE_IDLE = "idle"
  private const val STATE_INITIALIZING = "initializing"
  private const val STATE_READY = "ready"
  private const val STATE_UNAVAILABLE = "unavailable"

  private const val REASON_NO_ENGLISH = "本机没有可用的英文语音"
  private const val REASON_NOT_ATTACHED = "TTS 桥未挂载到 Activity"
  private const val REASON_INIT_FAILED = "系统语音初始化失败"
  private const val REASON_NOT_INITIALIZED = "语音尚未初始化"

  /** 由 Rust 传入的 Application Context；用 applicationContext 避免持有 Activity 造成泄漏。 */
  private var appContext: Context? = null

  private var tts: TextToSpeech? = null

  /** idle / initializing / ready / unavailable。主线程读写（JNI 闭包与 onInit 都在主线程）。 */
  @Volatile
  private var state = STATE_IDLE

  @Volatile
  private var reason: String? = REASON_NOT_INITIALIZED

  /** JNI 入口：把 Activity 作为 Context 交给桥。幂等。 */
  @JvmStatic
  fun attach(context: Context) {
    appContext = context.applicationContext ?: context
  }

  /**
   * 触发初始化并**立刻返回**。只在 idle 时构造一次 TextToSpeech（幂等）；
   * 状态推进全部发生在 onInit 回调里，这里绝不等它。
   */
  @JvmStatic
  fun ensureInit() {
    if (state != STATE_IDLE) return

    val context = appContext
    if (context == null) {
      state = STATE_UNAVAILABLE
      reason = REASON_NOT_ATTACHED
      return
    }

    state = STATE_INITIALIZING
    reason = null
    try {
      tts = TextToSpeech(context) { status ->
        val engine = tts
        if (status != TextToSpeech.SUCCESS || engine == null) {
          engine?.shutdown()
          tts = null
          state = STATE_UNAVAILABLE
          reason = REASON_INIT_FAILED
        } else {
          applyEnglish(engine)
        }
      }
    } catch (t: Throwable) {
      tts = null
      state = STATE_UNAVAILABLE
      reason = REASON_INIT_FAILED + "：" + (t.message ?: t.javaClass.simpleName)
    }
  }

  /**
   * JNI 入口：当前状态。Rust 侧每 60ms 轮询一次，直到 ready / unavailable 或 5 秒超时。
   * JSON 形状由 `tts_bridge.rs` 的 `probe_from_json` 钉住。
   */
  @JvmStatic
  fun probeJson(): String = when (state) {
    STATE_READY -> stateJson(STATE_READY, available = true, reason = null)
    STATE_UNAVAILABLE ->
      stateJson(STATE_UNAVAILABLE, available = false, reason = reason ?: REASON_NO_ENGLISH)
    else ->
      stateJson(STATE_INITIALIZING, available = false, reason = reason ?: REASON_NOT_INITIALIZED)
  }

  /** JNI 入口：朗读。非 ready 时只回状态 JSON，绝不排队、绝不等待初始化。 */
  @JvmStatic
  fun speak(text: String, rate: Float): String {
    val engine = tts
    if (state != STATE_READY || engine == null) return probeJson()

    if (engine.setSpeechRate(rate) != TextToSpeech.SUCCESS) {
      return stateJson(STATE_UNAVAILABLE, available = false, reason = "设置语速失败")
    }

    val utteranceId = "wordsett-" + System.nanoTime()
    val queued = engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId)
    return if (queued == TextToSpeech.SUCCESS) {
      stateJson(STATE_READY, available = true, reason = null)
    } else {
      stateJson(STATE_UNAVAILABLE, available = false, reason = "系统语音拒绝朗读")
    }
  }

  /** onInit 里定语言：英文不可用即整体不可用（绝不用中文音色读英文）。 */
  private fun applyEnglish(engine: TextToSpeech) {
    val language = engine.setLanguage(Locale.ENGLISH)
    val supported = language != TextToSpeech.LANG_MISSING_DATA &&
      language != TextToSpeech.LANG_NOT_SUPPORTED &&
      engine.isLanguageAvailable(Locale.ENGLISH) >= TextToSpeech.LANG_AVAILABLE
    if (supported) {
      state = STATE_READY
      reason = null
    } else {
      state = STATE_UNAVAILABLE
      reason = REASON_NO_ENGLISH
    }
  }

  private fun stateJson(state: String, available: Boolean, reason: String?): String {
    return "{\"state\":\"" + state + "\",\"available\":" + available +
      ",\"reason\":" + quote(reason) + "}"
  }

  /** 最小 JSON 字符串转义（reason 可能是异常消息，含引号/换行）。 */
  private fun quote(value: String?): String {
    if (value == null) return "null"
    val out = StringBuilder(value.length + 2)
    out.append('"')
    for (ch in value) {
      when {
        ch == '"' -> out.append("\\\"")
        ch == '\\' -> out.append("\\\\")
        ch == '\n' -> out.append("\\n")
        ch == '\r' -> out.append("\\r")
        ch == '\t' -> out.append("\\t")
        ch < ' ' -> out.append("\\u").append(ch.code.toString(16).padStart(4, '0'))
        else -> out.append(ch)
      }
    }
    out.append('"')
    return out.toString()
  }
}
