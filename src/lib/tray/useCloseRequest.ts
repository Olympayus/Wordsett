import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useUiStore } from '../../stores/uiStore'
import { resolveCloseRequest } from '../config'
import { confirmLeaveEdit } from '../editGuard'

/**
 * 关窗请求的处理器（每次挂载建一份，`useCloseRequest` 只负责把它接到事件上）。
 *
 * **序号是必须的（v0.7.8 Task 7 修复轮 2）**：`close_dialog_seen` 要等
 * `resolve_close_request` 才落盘，所以弹窗开着时再按一次 Alt+F4 / 再点一次任务栏关闭，
 * Rust 会再 emit 一次 `close-requested`。`uiStore.confirm()` 只保留一个 resolver，新弹窗
 * 会把旧弹窗以 `false` 结算——而对关窗弹窗来说 `false` 的意思是「直接退出」。没有序号的话，
 * 旧流程会把这次「被顶掉」误当成用户选择，静默退出并持久化 `close_to_tray=false`。
 * 取号后先比对再执行：被更新请求覆盖的流程什么都不做，只让最后一次请求结算
 * `resolve_close_request`。
 */
export function makeCloseRequestHandler(): () => Promise<void> {
  let seq = 0
  return async () => {
    const mine = ++seq
    const toTray = await useUiStore.getState().confirm({
      title: '关闭主窗口？',
      message: '选「最小化到托盘」后窗口可随时从托盘图标找回。本次选择会记入设置，之后沿用；要改去 设置 → 托盘与窗口。',
      confirmLabel: '最小化到托盘',
      cancelLabel: '直接退出',
      dismissable: false,
    })
    // 处理期间又来了新的 close-requested：本次的 confirm 已被 uiStore 以 false 覆盖结算，
    // 那**不是**用户的选择。直接退出，交给最新一次请求继续。
    if (mine !== seq) return
    // 直接退出会丢掉未保存的编辑，先过编辑守卫（v0.7.8 Task 7）；拒绝则窗口保持打开。
    // 最小化到托盘不确认：编辑态原样保留，回到窗口还能继续。
    if (!toTray && !(await confirmLeaveEdit())) return
    await resolveCloseRequest(toTray)
  }
}

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
    const onCloseRequested = makeCloseRequestHandler()
    const unlisten = listen('close-requested', () => { void onCloseRequested() })
    return () => { void unlisten.then(f => f()) }
  }, [])
}
