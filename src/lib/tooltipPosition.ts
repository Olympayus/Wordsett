// src/lib/tooltipPosition.ts
//
// 提示面板的落点（一律是视口视觉 CSS 像素，v0.7.10）。触发器矩形与面板尺寸都由
// `getBoundingClientRect` 量到——平板的 `zoom` 已乘进这两个值里，二者同一坐标系，
// 故这里不再另做 `zoom` 换算。

export interface RectLike { left: number; right: number; top: number; bottom: number }
export interface PanelSize { width: number; height: number }
export type TooltipPlacement = 'auto' | 'below' | 'above' | 'right' | 'left'

/** 面板与视口边缘之间的最小余量。 */
const MARGIN = 4

/**
 * 计算提示面板落点（v0.7.10 收尾修正）。
 *
 * - `auto`：右侧 → 左侧 → 下方 → 上方，取第一个放得下的方向；
 * - 贴边方向都按**交叉轴居中**对齐触发器：右 / 左侧时纵向居中，上 / 下方时横向居中。
 *   早先右/左侧只做「顶边对齐」，左下角「设置」的面板被纵向收纳后斜着飘到按钮右上角，
 *   读起来像离得很远；居中后它始终挂在按钮边上；
 * - 显式方向（如顶部窗口控制键的 `below`）不受剩余空间影响，最后统一钳回视口——
 *   面板比视口还宽/高时宁可压住锚点，也不让它掉出窗口。
 */
export function placeTooltip(
  anchor: RectLike,
  panel: PanelSize,
  placement: TooltipPlacement,
  vw: number,
  vh: number,
  gap: number,
): { x: number; y: number } {
  const w = panel.width
  const h = panel.height
  const cx = (anchor.left + anchor.right) / 2
  const cy = (anchor.top + anchor.bottom) / 2
  const rightX = anchor.right + gap
  const leftX = anchor.left - gap - w
  const belowY = anchor.bottom + gap
  const aboveY = anchor.top - gap - h

  const dir: Exclude<TooltipPlacement, 'auto'> = placement !== 'auto'
    ? placement
    : rightX + w <= vw - MARGIN ? 'right'
      : leftX >= MARGIN ? 'left'
        : belowY + h <= vh - MARGIN ? 'below'
          : 'above'

  let x: number
  let y: number
  if (dir === 'right') { x = rightX; y = cy - h / 2 }
  else if (dir === 'left') { x = leftX; y = cy - h / 2 }
  else if (dir === 'below') { x = cx - w / 2; y = belowY }
  else { x = cx - w / 2; y = aboveY }

  return {
    x: Math.max(MARGIN, Math.min(x, vw - w - MARGIN)),
    y: Math.max(MARGIN, Math.min(y, vh - h - MARGIN)),
  }
}
