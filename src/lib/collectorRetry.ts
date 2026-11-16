/**
 * 「重试」与小窗已在显示时再次按热键共用的焦点回流序列（v0.7.9 spec §5.1 / §11-1）。
 *
 * 小窗自己持有前台焦点时读选区，读到的只会是它自己。因此两条路径都按同一顺序：
 * **隐藏小窗 → 等焦点回到原应用 → 再读一次 → 由 Rust 重新显示**。120ms 是
 * `shortcut.rs` 的 `FOCUS_RETURN_DELAY`，两处必须同值；前端只负责隐藏与触发读取，
 * 显示由 Rust 在投递 `collector-grab` 前完成（本序列的 `show` 步在前端是空操作）。
 *
 * 纯函数、无 Tauri 依赖：序列可单测，Root 只做逐步执行。
 */

export type RetryStep = 'hide' | 'wait' | 'read' | 'show'

/** `wait` 步的固定时长（ms），与 Rust `FOCUS_RETURN_DELAY` 同值。 */
export const RETRY_WAIT_MS = 120

/**
 * 重试的固定步骤。顺序即语义：先藏、再等焦点归还、然后读、最后（由 Rust）显示。
 * 返回新数组：调用方遍历时不会被共享引用影响。
 */
export function retrySequence(): RetryStep[] {
  return ['hide', 'wait', 'read', 'show']
}
