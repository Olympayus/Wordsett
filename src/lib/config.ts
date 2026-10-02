import { invoke } from '@tauri-apps/api/core'

/**
 * `shortcuts.json` 的形状（Rust 侧 `config::defaults()` 是唯一出处）。
 *
 * 这些配置**不走 zustand persist**：`CloseRequested` 要在 Rust 侧同步判断，
 * Rust 读不到 localStorage。规则是「Rust 运行时需要同步读的 → 这个文件；
 * 纯前端 UI 状态 → zustand」。
 */
export interface AppConfig {
  actions: Record<string, string>
  tts: { voice: string | null; rate: number }
  window: { close_to_tray: boolean; close_dialog_seen: boolean }
  tray: { show_due_count: boolean }
}

export const getConfig = () => invoke<AppConfig>('get_config')

/** 深合并进现有配置，返回合并后的完整值（Rust 写盘成功才返回）。 */
export const setConfig = (patch: Record<string, unknown>) =>
  invoke<AppConfig>('set_config', { patch })

/**
 * 关窗弹窗的结论 → 配置补丁。两个按钮都写 `close_dialog_seen`，
 * 所以弹窗只会出现一次。
 */
export function closePatch(primary: boolean) {
  return { window: { close_dialog_seen: true, close_to_tray: primary } }
}

/** 把一个关窗结论落到 Rust：写配置 + 隐藏或退出。 */
export const resolveCloseRequest = (closeToTray: boolean) =>
  invoke<void>('resolve_close_request', { closeToTray })