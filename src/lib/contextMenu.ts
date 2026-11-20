import { isMobileOS, type PlatformClass } from './platform'

/**
 * 右键菜单的目标判定（v0.8.0 Task 12，WKWebView 文本手势隔离）。
 *
 * 移动形态下 `TextContextMenu` 与 `useTouchLongPress` 都在 `contextmenu` 上无条件
 * `preventDefault()`：前者防止系统菜单盖住自绘「复制 / 粘贴」，后者防止长按表面弹出
 * 系统菜单。但 iOS 的 WKWebView 里，输入框的粘贴菜单是**系统能力**——应用自绘菜单
 * 无法替代剪贴板读写（`navigator.clipboard` 在 WebView 里受限），故输入框内必须放行。
 *
 * 放行只认「移动形态 + 目标是 input / textarea」两条同时成立：桌面右键菜单行为与
 * 既有版本逐字一致，非输入框在移动端仍照旧拦截。
 */
export function shouldSkipContextMenu(platform: PlatformClass, targetTag: string | null): boolean {
  if (!isMobileOS(platform)) return false
  return targetTag === 'INPUT' || targetTag === 'TEXTAREA'
}
