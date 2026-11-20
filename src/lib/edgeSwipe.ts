/**
 * iOS 左缘右滑返回（v0.8.0 Task 11）：判据纯函数。
 *
 * 与跟手动画无关——本轮是**阈值触发式**：手指从左缘按下、向右拖过一段距离后，
 * 在抬起（`pointerup` / `pointercancel`）的那一刻判一次，命中就调返回 handler。
 *
 * 判据三条同时成立：
 * 1. 起点落在左缘 `edgeWidth` 内（`x <= edgeWidth`）——只有从屏幕左缘开始的滑动才可能是
 *    系统返回手势，正文中部的横滑留给页签条 / 抽屉等自有横滑控件；
 * 2. 水平位移足够（`dx >= minDistance`）——防止点按边缘时的抖动误触；
 * 3. 横向为主（`|dy| <= dx * maxVerticalRatio`）——竖向为主的滑动是滚动，
 *    不能因为起点碰巧在左缘就把页面退掉。
 *
 * 纯函数放在这里而不是写进 hook：node 环境可测（仓库无组件测试 harness），
 * 阈值与判据只有这一处，hook 只负责事件接线。
 */

/** 屏幕坐标（CSS px，与 `PointerEvent.clientX/Y` 同单位）。 */
export interface EdgeSwipePoint { x: number; y: number }

export interface EdgeSwipeOptions {
  /** 左缘判定带宽度（pt）：起点 `x` 不超过它才算「从左缘开始」。 */
  edgeWidth?: number
  /** 触发所需的最小水平右移距离（pt）。 */
  minDistance?: number
  /** 允许的竖向偏移占水平位移的比例上限（超出即判为滚动）。 */
  maxVerticalRatio?: number
}

export const EDGE_SWIPE_EDGE_WIDTH = 20
export const EDGE_SWIPE_MIN_DISTANCE = 60
export const EDGE_SWIPE_MAX_VERTICAL_RATIO = 0.5

export function shouldTriggerEdgeBack(
  start: EdgeSwipePoint,
  current: EdgeSwipePoint,
  opts?: EdgeSwipeOptions,
): boolean {
  const edgeWidth = opts?.edgeWidth ?? EDGE_SWIPE_EDGE_WIDTH
  const minDistance = opts?.minDistance ?? EDGE_SWIPE_MIN_DISTANCE
  const maxVerticalRatio = opts?.maxVerticalRatio ?? EDGE_SWIPE_MAX_VERTICAL_RATIO
  const dx = current.x - start.x
  const dy = current.y - start.y
  return start.x <= edgeWidth && dx >= minDistance && Math.abs(dy) <= dx * maxVerticalRatio
}
