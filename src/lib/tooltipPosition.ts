// src/lib/tooltipPosition.ts
//
// 坐标一律是视口视觉 CSS 像素（v0.7.10 Task 18）。平板 `zoom` 宿主下，`getBoundingClientRect`
// 已经给出缩放后的视觉坐标，而 portal 面板的布局尺寸要乘 `zoom` 才是视觉尺寸——翻边与收纳
// 都必须按视觉尺寸判断。`zoom` 可选，默认 1 → 桌面逐字不变。
export interface RectLike { left: number; right: number; top: number }

export function tooltipPosition(
  rect: RectLike, panelWidth: number, gap: number, vw: number, zoom = 1
): { x: number; y: number } {
  const visualWidth = panelWidth * zoom
  const canOpenLeft = rect.left - gap - visualWidth > 4
  const overflowRight = rect.right + gap + visualWidth > vw - 4
  const flipLeft = canOpenLeft && overflowRight
  return {
    x: flipLeft ? rect.left - gap - visualWidth : rect.right + gap,
    y: Math.max(4, rect.top),
  }
}

/**
 * 纵向修正。tooltipPosition 只按锚点位置给出起点 y，而面板实际高度要渲染后才量得到，
 * 故渲染后单独做一步：原先只有 y ≥ 4 这一个约束，面板一直向下长，内容一高就超出窗口下缘
 * （搜索设置里「词典返回词条」的说明有十几行，挂在靠下的分区标题上必然溢出）。
 *
 * 顺序：下方放得下就原地不动 → 下方溢出则翻到锚点上方 → 上方也放不下则贴视口底部 →
 * 面板比视口还高时兜底留在顶部 8px（宁可下缘超出，也不让顶部跑到窗口外）。
 */
export function clampTooltipY(
  anchorTop: number, y: number, panelHeight: number, vh: number, gap: number, zoom = 1
): number {
  const visualHeight = panelHeight * zoom
  if (y + visualHeight + gap <= vh) return y
  const above = anchorTop - gap - visualHeight
  if (above >= 8) return above
  return Math.max(8, vh - gap - visualHeight)
}
