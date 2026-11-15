import { useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { usePlatformClass } from './usePlatform'
import { useUiStore } from '../stores/uiStore'
import {
  confirmLeaveEdit, handleAppBlur, needsConfirmEditLeave, shouldInterceptEditClick,
} from './editGuard'

/**
 * 未保存编辑守卫的两条全局监听（v0.7.8 Task 6，设计稿 §5.0 / §5.3）。
 *
 * 守卫本体（`lib/editGuard.ts`）是模块级单例、不持任何 React 状态；本 hook 只负责把
 * 「整个应用窗口失焦」与「应用内点击」两件事接到它上面。`App` 全局挂**恰好一次**——
 * 多挂一次会多出一套监听（同一事件确认两次；in-flight 去重虽然兜得住，但没必要）。
 *
 * 平台分流只影响失焦判据：
 * - 桌面：Tauri `getCurrentWindow().onFocusChanged`，`payload === false` 即失焦；
 * - Android（手机 / 平板）：`document.visibilitychange` 进入 `hidden`。
 * 点击拦截两端共用一套（捕获阶段 pointerdown + click 各一条）。
 */
export function useEditGuard(): void {
  const platform = usePlatformClass()

  // ── 失焦（§5.4）────────────────────────────────────────────────────────────────
  // `handleAppBlur` 自己分流：dirty → 弹确认；未改动 → 静默退出编辑；无守卫 → 什么都不做。
  // 两条路径都用 try/catch 静默：浏览器 / vitest 里没有 Tauri 窗口，`onFocusChanged` 会
  // reject，但那只意味着「这个环境没有窗口失焦这回事」，不该打断启动。
  //
  // 桌面分支的退订是异步的（`onFocusChanged` 返回 `Promise<UnlistenFn>`）：`catch` 要**立刻**
  // 挂上，否则非 Tauri 环境（浏览器 / vitest）里的 rejection 会变成未处理拒绝；`alive` 标志
  // 管住「Promise 落地前组件已卸载」——那时直接退订，不留监听。
  useEffect(() => {
    if (platform === 'desktop') {
      let alive = true
      let unlisten: (() => void) | null = null
      try {
        void getCurrentWindow().onFocusChanged(({ payload }) => {
          if (!payload) handleAppBlur()
        }).then(f => {
          if (alive) unlisten = f
          else f()
        }).catch(() => {})
      } catch {
        // 窗口 API 不可用：这个环境没有「窗口失焦」这回事，静默跳过。
      }
      return () => {
        alive = false
        unlisten?.()
      }
    }
    // Android 手机 / 平板：切到后台 = 失焦。与应用内确认框无关（那不会触发 visibilitychange）。
    try {
      const onVisibility = () => {
        if (document.visibilityState === 'hidden') handleAppBlur()
      }
      document.addEventListener('visibilitychange', onVisibility)
      return () => document.removeEventListener('visibilitychange', onVisibility)
    } catch {
      return
    }
  }, [platform])

  // ── 应用内点击拦截（§5.3）──────────────────────────────────────────────────────
  // dirty 时，点在「编辑输入框 / 保存取消 / 确认框」以外的地方一律先确认，并吞掉这一次点击
  // （设计稿：第一次点击只用于确认，用户再点一次目标控件）。白名单选择器：
  //   · `[data-field-edit]`——编辑中的 FieldCard / 流式单位（点输入框自己不弹）；
  //   · `[data-edit-keep]`——WorkbenchNavBar / MobileAppBar 的保存 / 取消；
  //   · `[role="dialog"]`——应用内浮层（底部表、抽屉、编辑弹窗…）。
  // 确认框自己由 `confirmOpen` 判据兜住（store 只有一个 resolver，不能覆盖它）。
  //
  // 捕获阶段是硬要求：React 的事件在 root 上冒泡 / 捕获，document 的捕获监听先于它们执行，
  // `stopPropagation` 因此能保证目标控件（导航箭头、链接、页签…）一个 handler 都不跑。
  // 有些 WebView 会补发 click——用一次性闸门把紧随其后的那一次也吞掉。
  useEffect(() => {
    let swallowNextClick = false

    const onPointerDown = (e: PointerEvent) => {
      // 新的一次按下意味着新手势：先复位闸门。触摸端 `preventDefault()` 会抑制兼容
      // mouse 事件（click 可能根本不补发），若不复位，闸门会一直为真，把下一枚按钮
      // （尤其是确认框自己的「继续编辑 / 放弃修改」）的 click 吞掉。
      swallowNextClick = false
      const target = e.target instanceof Element ? e.target : null
      const intercept = shouldInterceptEditClick({
        dirty: needsConfirmEditLeave(),
        confirmOpen: !!useUiStore.getState().confirmReq,
        inEditor: !!target?.closest('[data-field-edit]'),
        keep: !!target?.closest('[data-edit-keep], [role="dialog"]'),
      })
      if (!intercept) return
      e.preventDefault()
      e.stopPropagation()
      swallowNextClick = true
      void confirmLeaveEdit()
    }

    const onClick = (e: MouseEvent) => {
      if (!swallowNextClick) return
      swallowNextClick = false
      e.preventDefault()
      e.stopPropagation()
    }

    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('click', onClick, true)
    }
  }, [])
}
