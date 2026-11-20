/**
 * iOS 左缘右滑返回（v0.8.0 Task 11）：把 `useMobileBackStack` 的 handler 接到边缘手势。
 *
 * **只在 iOS 手机挂监听**（`isIOS` + `usesMobileShell`）：桌面 / Android 一条监听都不挂，
 * 安卓的返回是系统返回键（`mobileBackButton`），桌面没有返回手势——零回归。
 *
 * 本轮是**阈值触发式**，不做跟手动画：`pointerdown`（capture）记录起点，`pointerup` /
 * `pointercancel` 时按 `shouldTriggerEdgeBack` 判一次，命中调 `handler()` 一次。
 * 判据与阈值收在纯函数里（`edgeSwipe.ts`，node 可测）。
 *
 * 刻意**不 `preventDefault`**：左缘横滑与 dnd-kit 拖拽、页签条 / 抽屉横滑共处，
 * 拦掉默认行为会打断它们；手势只「旁听」，命中才在抬手时退一层。
 *
 * handler 经 ref 递进：监听只在挂载时挂一次，而返回 handler 的闭包随编辑态 / 抽屉态变化，
 * 订阅里必须调用**最新**的那份。
 */

import { useEffect, useRef } from 'react'
import { isIOS, usesMobileShell } from './platform'
import { usePlatformClass } from './usePlatform'
import { EDGE_SWIPE_EDGE_WIDTH, shouldTriggerEdgeBack, type EdgeSwipePoint } from './edgeSwipe'

/** 进行中的边缘手势：起点 + 手势所属指针（多指时只跟踪最先落在左缘的那一指）。 */
interface EdgeSwipeStart extends EdgeSwipePoint { pointerId: number }

export function useEdgeSwipeBack(handler: () => void): void {
  const platform = usePlatformClass()
  const enabled = isIOS(platform) && usesMobileShell(platform)

  const handlerRef = useRef(handler)
  useEffect(() => { handlerRef.current = handler }, [handler])

  useEffect(() => {
    if (!enabled) return
    let start: EdgeSwipeStart | null = null

    const onPointerDown = (e: PointerEvent) => {
      // 只认手指：鼠标 / 触控笔的左缘拖动不是系统返回手势。
      if (e.pointerType !== 'touch') return
      // 编辑框内不记录起点（v0.8.0 终审）：输入框里的左缘横滑是文字选择，不该退一层。
      // 判据与 `useTouchLongPress` 的输入框放行同一套包含检查。
      if ((e.target as HTMLElement | null)?.closest('input, textarea, [contenteditable]')) return
      // 起点必须在左缘判定带内，正文中部的横滑不参与。
      if (e.clientX > EDGE_SWIPE_EDGE_WIDTH) return
      // 已有一指在手势中时不抢它的起点（多指落下只认最先的那一指）。
      if (start && start.pointerId !== e.pointerId) return
      start = { x: e.clientX, y: e.clientY, pointerId: e.pointerId }
    }

    const onPointerEnd = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.pointerId) return
      const current = { x: e.clientX, y: e.clientY }
      const triggered = shouldTriggerEdgeBack(start, current)
      // 一次手势只判一次：无论命中与否都清掉起点，后续抬起事件不再重复调用。
      start = null
      if (triggered) handlerRef.current()
    }

    document.addEventListener('pointerdown', onPointerDown, { capture: true })
    document.addEventListener('pointerup', onPointerEnd)
    document.addEventListener('pointercancel', onPointerEnd)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, { capture: true })
      document.removeEventListener('pointerup', onPointerEnd)
      document.removeEventListener('pointercancel', onPointerEnd)
    }
  }, [enabled])
}
