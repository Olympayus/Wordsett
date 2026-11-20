/**
 * 键盘遮挡判据（v0.8.0 iOS Task 13）。
 *
 * iOS 的 WKWebView 在键盘弹出时**不会**缩小布局视口，只有 `window.visualViewport`
 * 变成「未被键盘遮住的那一块」。因此「有没有被键盘压住」与「该不该滚」都只能拿
 * visualViewport 矩形和元素矩形比，不能用 `window.innerHeight`。
 *
 * 抽成纯函数是为了能在 node 环境里钉住两条公式（仓库没有组件测试 harness）。
 */

/** 矩形：只取纵向判据用得到的三段。`bottom` 与 `top + height` 同源。 */
export interface ViewportRect {
  top: number
  bottom: number
  height: number
}

/**
 * 键盘遮住的高度（px）：布局视口高减去 visualViewport 的可见段
 * （`height + top`——页面自身滚动时 visualViewport 会整体下移，offsetTop 要算进去）。
 * 夹 0：visualViewport 与布局同高时返回 0，不会出负数。
 */
export function keyboardOverlap(viewport: ViewportRect, layoutHeight: number): number {
  return Math.max(0, layoutHeight - (viewport.height + viewport.top))
}

/**
 * 元素是否越出可视区：底边被压住（bottom 超出视口底）或顶边被顶出视口顶。
 * 命中任一条即需要 `scrollIntoView`；完全落在 `[viewport.top, viewport.bottom]` 内则不滚。
 */
export function shouldScrollIntoView(element: ViewportRect, viewport: ViewportRect): boolean {
  return element.bottom > viewport.bottom || element.top < viewport.top
}
