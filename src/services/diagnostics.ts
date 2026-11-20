import { invoke } from '@tauri-apps/api/core'

let installed = false

/**
 * 把未捕获异常转发到 Rust 日志文件（v0.8.0 Task 1）。
 *
 * 真机上没有 DevTools 可看，前端崩溃只能靠日志文件回传：`window.onerror` 与
 * `unhandledrejection` 两条路径都汇到 `log_frontend_error`，与 Rust 侧 `log::error!`
 * 落在同一份 `wordsett.log`。
 *
 * 节流：同一消息 5s 内只报一次。渲染循环里反复抛同一个错时，没有这道闸门会把日志
 * 文件瞬间写爆、真正有用的上下文被滚动覆盖。以完整消息为键（含堆栈），
 * 不同错误互不影响。
 *
 * 所有失败一律静默：错误转发本身再抛错只会二次触发 window.onerror，形成回环。
 */
export function installErrorForwarding(): void {
  if (installed) return
  installed = true
  const seen = new Map<string, number>()
  const send = (level: 'error' | 'warn', message: string) => {
    const now = Date.now()
    if ((seen.get(message) ?? 0) + 5000 > now) return
    seen.set(message, now)
    void invoke('log_frontend_error', { level, message }).catch(() => {})
  }
  window.addEventListener('error', e => send('error', `${e.message} @ ${e.filename}:${e.lineno}`))
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason
    send('error', `unhandled rejection: ${r instanceof Error ? `${r.message}\n${r.stack ?? ''}` : String(r)}`)
  })
}
