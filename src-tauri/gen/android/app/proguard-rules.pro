# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# JNI 桥梁（Task 13）：TtsBridge 只被 Rust 按名字（`Class.forName` + `call_static_method`）
# 引用，Kotlin 侧没有任何调用点。AGP 8.11 的默认规则只认 `android.support.annotation.Keep`、
# 不认 androidx 版，R8 9.4 的内建支持又只覆盖 `androidx.annotation.keep.*` 新注解——
# 结果就是类名被 `proguard-wry.pro` 的 `-keep class com.wordsett.app.*`（仅 native 方法）
# 保住、四个 @JvmStatic 入口全被裁掉：debug 正常，release 包 TTS 静默失效。
# 这行显式 keep 是 release 构建的唯一保障，删掉前先读 TtsBridge.kt 文件头。
-keep @androidx.annotation.Keep class * {*;}

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile