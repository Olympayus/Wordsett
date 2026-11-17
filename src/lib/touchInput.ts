/**
 * 触摸输入档（v0.7.10 §7.4）：移动外壳内输入框字号 ≥ 16px、高 ≥ 40px。
 *
 * 16px 是 iOS WKWebView「聚焦不放大页面」的门槛；Android WebView 不放大，本版仍按同一档做，
 * 作为 v0.8 iOS 的前置（两端一套视觉）。`false` 返回**空对象**——调用点在桌面分支里无条件
 * 展开它，样式对象因此逐字不变（空展开没有副作用）。
 *
 * 用法：调用点只取**一处**判据（组件的 `touch` prop / 手机外壳专属语境 / `hasCoarsePointer()`），
 * 然后把返回值展开进输入框的 `style`。桌面（`false`）分支不写任何条件。
 */
export function touchInputStyles(isTouch: boolean): { fontSize?: number; minHeight?: number; padding?: string } {
  return isTouch ? { fontSize: 16, minHeight: 40, padding: '8px 12px' } : {}
}
