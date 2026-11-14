import type { CSSProperties } from 'react'

// 触摸命中区覆盖层不得参与布局：只用绝对定位扩边，绝不用 margin / padding 撑开——
// 那会把相邻内容挤动一位，鼠标态与触摸态之间来回切时整行文字都会跳。
// 手柄右缘止于正文起点由调用方用 `right` 覆盖。

/** 长按判定阈值（毫秒）。 */
export const TOUCH_LONG_PRESS_MS = 250
/** 滑动容差（像素）：位移超过此距离即视为滑动而非长按。 */
export const TOUCH_SLOP_PX = 8
/** 触摸命中区最小边长（像素）。 */
export const TOUCH_TARGET_PX = 44

/** 以勾股距离判定手指是否已滑出容差。 */
export function exceedsSlop(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) > TOUCH_SLOP_PX
}

/**
 * 绝对定位命中区样式。
 * 默认 44×44 覆盖在目标上方；`verticalOnly` 时只纵向扩，横向贴满父级。
 */
export function hitAreaStyle(opts?: { verticalOnly?: boolean }): CSSProperties {
  if (opts?.verticalOnly) {
    return {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      width: 'auto',
      height: `${TOUCH_TARGET_PX}px`,
      pointerEvents: 'auto',
    }
  }
  return {
    position: 'absolute',
    top: 0,
    width: `${TOUCH_TARGET_PX}px`,
    height: `${TOUCH_TARGET_PX}px`,
    pointerEvents: 'auto',
  }
}
