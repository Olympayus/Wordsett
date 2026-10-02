import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useUiStore } from '../../stores/uiStore'
import { resolveCloseRequest } from '../config'

/**
 * 首次关窗的应用内双按钮弹窗（设计 §4.7）。
 *
 * Rust 侧 `CloseRequested` 在 `window.close_dialog_seen === false` 时
 * `prevent_close()` 并 emit `close-requested`，由这里弹窗；用户点完按钮，
 * 结论经 `resolve_close_request` 落回 Rust（写配置 + 隐藏或退出）。
 *
 * **两个按钮都是肯定动作**，所以用 `confirm()` 的布尔返回值映射而不是它的默认语义：
 * `true` = 主按钮 = 最小化到托盘，`false` = 次按钮 = 直接退出。
 * `dismissable: false` 是必须的——遮罩点击会 resolve(false)，那等于直接退出应用。
 */
export function useCloseRequest(): void {
  useEffect(() => {
    const unlisten = listen('close-requested', async () => {
      const toTray = await useUiStore.getState().confirm({
        title: '关闭主窗口？',
        message: '选「最小化到托盘」后窗口可随时从托盘图标找回。本次选择会记入设置，之后沿用；要改去 设置 → 托盘与窗口。',
        confirmLabel: '最小化到托盘',
        cancelLabel: '直接退出',
        dismissable: false,
      })
      await resolveCloseRequest(toTray)
    })
    return () => { void unlisten.then(f => f()) }
  }, [])
}
