// src/lib/tooltipPosition.ts
export interface RectLike { left: number; right: number; top: number }

export function tooltipPosition(
  rect: RectLike, panelWidth: number, gap: number, vw: number
): { x: number; y: number } {
  const canOpenLeft = rect.left - gap - panelWidth > 4
  const overflowRight = rect.right + gap + panelWidth > vw - 4
  const flipLeft = canOpenLeft && overflowRight
  return {
    x: flipLeft ? rect.left - gap - panelWidth : rect.right + gap,
    y: Math.max(4, rect.top),
  }
}

/**
 * 纵向修正。tooltipPosition 只按锚点位置给出起点 y，而面板实际高度要渲染后才量得到，
 * 故渲染后单独做一步：原先只有 y ≥ 4 这一个约束，面板一直向下长，内容一高就超出窗口下缘
 * （搜索设置里「词典」两处说明都是十几行，挂在靠下的分区标题上必然溢出）。
 *
 * 顺序：下方放得下就原地不动 → 下方溢出则翻到锚点上方 → 上方也放不下则贴视口底部 →
 * 面板比视口还高时兜底留在顶部 8px（宁可下缘超出，也不让顶部跑到窗口外）。
 */
export function clampTooltipY(
  anchorTop: number, y: number, panelHeight: number, vh: number, gap: number
): number {
  if (y + panelHeight + gap <= vh) return y
  const above = anchorTop - gap - panelHeight
  if (above >= 8) return above
  return Math.max(8, vh - gap - panelHeight)
}
