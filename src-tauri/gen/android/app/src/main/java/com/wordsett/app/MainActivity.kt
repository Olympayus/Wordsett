package com.wordsett.app

import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.annotation.Keep
import androidx.core.view.WindowCompat

/**
 * `@Keep`：`applySystemBarsTheme` 只被 Rust 经 JNI 按名字调用（`system_bars.rs`），
 * Kotlin 侧没有调用点。`app/proguard-rules.pro` 的
 * `-keep @androidx.annotation.Keep class * {*;}` 靠这条类注解保住整个类（含 JNI 入口），
 * release 包才不会把它裁掉。删注解前先读那条规则。
 */
@Keep
class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  /**
   * 状态栏 / 手势条图标跟随应用主题（v0.7.8 Task 9）。
   *
   * 由 Rust 的 `set_system_bars_theme` 调 `applySystemBarsTheme(Z)V`。
   * `isAppearanceLightStatusBars = true` 的语义是「背景是浅色、请用深色图标」，
   * 故深色主题传 `false`（两处都取 `!dark`）。
   */
  fun applySystemBarsTheme(dark: Boolean) {
    val controller = WindowCompat.getInsetsController(window, window.decorView)
    val light = !dark
    controller.isAppearanceLightStatusBars = light
    controller.isAppearanceLightNavigationBars = light
  }
}
