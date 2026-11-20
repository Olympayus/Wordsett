import { useEffect } from 'react'
import { shouldScrollIntoView, type ViewportRect } from './keyboard'

/** 受键盘影响的焦点元素：文本输入、多行输入、可编辑区。与设计稿的选择器逐字一致。 */
const FOCUS_SELECTOR = 'input, textarea, [contenteditable]'

/**
 * 键盘遮挡处理（v0.8.0 iOS Task 13）：输入框 / 评分条被键盘压住时把它滚到可视区中间。
 *
 * iOS 的 WKWebView 键盘弹出时布局视口不变，只有 `window.visualViewport` 收缩，
 * 故这里监听 visualViewport 的 `resize` / `scroll`（而非 window resize），每次触发
 * 取当前焦点元素与可视矩形比对，命中 `shouldScrollIntoView` 才滚。
 *
 * `enabled` 为假时**一条监听都不挂**：Android 的 WebView 会自行 resize、桌面没有键盘
 * 遮挡问题，两者逐字保持原行为。环境没有 `window.visualViewport`（桌面浏览器 / 老
 * WebView）时同样静默跳过，不报错。
 *
 * 调用点 `App` 全局挂一次，判据是 `isIOS(platform) && isMobileOS(platform)`。
 */
export function useKeepFocusedVisible(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    const vv = window.visualViewport
    if (!vv) return

    const check = () => {
      const el = document.activeElement
      // 焦点可能在 body / null / 非 Element 节点上，先用 Element 收窄再匹配选择器。
      if (!(el instanceof Element) || !el.matches(FOCUS_SELECTOR)) return
      const r = el.getBoundingClientRect()
      const viewport: ViewportRect = {
        top: vv.offsetTop,
        bottom: vv.offsetTop + vv.height,
        height: vv.height,
      }
      if (!shouldScrollIntoView({ top: r.top, bottom: r.bottom, height: r.height }, viewport)) return
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }

    vv.addEventListener('resize', check)
    vv.addEventListener('scroll', check)
    return () => {
      vv.removeEventListener('resize', check)
      vv.removeEventListener('scroll', check)
    }
  }, [enabled])
}
