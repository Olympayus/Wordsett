import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEventHandler, PointerEventHandler } from 'react'
import { TOUCH_LONG_PRESS_MS, exceedsSlop } from './mobileHitArea'

/**
 * 手机长按判定（v0.7.7 Task 3，spec §3.1 / §3.9）。
 *
 * 触摸下没有 hover，行菜单 / 页签删除 / 抽屉行菜单只能靠长按；判定收在这一个 hook 里，
 * 所有调用点共用同一组阈值——`TOUCH_LONG_PRESS_MS` 与 `TOUCH_SLOP_PX` 来自
 * `mobileHitArea.ts`（与 `TouchSensor` 的 `delay` / `tolerance` 是同一组数字），
 * 这里不另写一份。
 *
 * **计时器必须在 pointerup 清理，否则双击第二下会误触发**——第一下抬起后若还留着
 * 上一轮的 250ms 计时器，第二下 pointerdown 会在旧计时器到点时把一次普通双击判成长按，
 * 于是「双击进编辑」变成「弹表」。故 pointerup / pointercancel / 滑出容差 / 卸载
 * 四处都要清掉它。
 *
 * `disabled` 为真时**完全惰性**：不起计时器、不拦 contextmenu——桌面挂同一个调用点
 * （`disabled: !touch`），右键菜单与桌面既有行为必须原样保留。
 */

export interface TouchLongPressOptions {
  /** 为真时本 hook 不改变任何行为（桌面分支就靠它）。 */
  disabled?: boolean
}

/** 可直接展开到元素上的五个处理器；`onContextMenu` 只在启用时拦截系统菜单。 */
export interface TouchLongPressHandlers {
  onPointerDown: PointerEventHandler<HTMLElement>
  onPointerMove: PointerEventHandler<HTMLElement>
  onPointerUp: PointerEventHandler<HTMLElement>
  onPointerCancel: PointerEventHandler<HTMLElement>
  onContextMenu: MouseEventHandler<HTMLElement>
}

/** 一次按压的起点：位移判定只跟同一个 pointerId 走，多指时互不干扰。 */
interface PressOrigin {
  x: number
  y: number
  pointerId: number
}

export function useTouchLongPress(
  onLongPress: () => void,
  opts?: TouchLongPressOptions,
): { handlers: TouchLongPressHandlers; pressing: boolean } {
  const disabled = opts?.disabled ?? false
  // 长按成立后置真、指针抬起 / 取消后归假：调用点据此画「按下中的临时高亮」。
  const [pressing, setPressing] = useState(false)

  // 回调存 ref：调用点几乎都传内联箭头，若进依赖数组，每次渲染都会重建处理器；
  // 更糟的是计时器在 250ms 后读到的会是**旧闭包**里的 state。
  const callbackRef = useRef(onLongPress)
  useEffect(() => { callbackRef.current = onLongPress })

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const originRef = useRef<PressOrigin | null>(null)
  // 本轮长按是否已经成立：成立后位移不再撤销（表都开了），清理交给 up / cancel。
  const firedRef = useRef(false)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // 卸载时清计时器：组件已经离开屏幕，250ms 后不该再 setState / 回调。
  useEffect(() => clearTimer, [clearTimer])

  // 半途被禁用（例如表已经打开、调用点把 disabled 置位）时把这一轮手势收掉，
  // 否则残留的计时器仍会在 250ms 后把表再弹一次。
  useEffect(() => {
    if (!disabled) return
    clearTimer()
    originRef.current = null
    firedRef.current = false
    setPressing(false)
  }, [disabled, clearTimer])

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (disabled) return
    // 只认主键 / 主指针：触屏是 button 0；右键留给桌面，不在这里起计时器。
    if (e.button !== 0) return
    clearTimer()
    originRef.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId }
    firedRef.current = false
    setPressing(false)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      firedRef.current = true
      // 先亮高亮再回调：回调里可能同步打开底部表，两者要在同一帧出现。
      setPressing(true)
      callbackRef.current()
    }, TOUCH_LONG_PRESS_MS)
  }, [disabled, clearTimer])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (disabled) return
    const origin = originRef.current
    if (!origin || origin.pointerId !== e.pointerId) return
    // 长按已成立后不再看位移：表已经开了，手指再滑不该把它撤掉。
    if (firedRef.current) return
    if (exceedsSlop(e.clientX - origin.x, e.clientY - origin.y)) {
      // 横向滑动优先：页签条 / 词条条 / 抽屉列表的滚动不能误触发表。
      clearTimer()
      originRef.current = null
      setPressing(false)
    }
  }, [disabled, clearTimer])

  // pointerup 与 pointercancel 同路：都是「这一轮结束」，清理计时器与按压态。
  const onRelease = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (disabled) return
    const origin = originRef.current
    if (origin && origin.pointerId !== e.pointerId) return
    clearTimer()
    originRef.current = null
    firedRef.current = false
    setPressing(false)
  }, [disabled, clearTimer])

  const onContextMenu = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (disabled) return
    // 无条件拦下：手机长按会先弹系统菜单，等它来了再判按压状态就晚了。
    // 不看 `pressing` 也不看目标——启用时这个元素的系统菜单本来就不该出现。
    e.preventDefault()
  }, [disabled])

  const handlers = useMemo<TouchLongPressHandlers>(() => ({
    onPointerDown,
    onPointerMove,
    onPointerUp: onRelease,
    onPointerCancel: onRelease,
    onContextMenu,
  }), [onPointerDown, onPointerMove, onRelease, onContextMenu])

  return { handlers, pressing }
}
