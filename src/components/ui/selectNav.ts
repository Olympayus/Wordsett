/**
 * 自绘 `Select` 的键盘步进（v0.7.10 Task 14）。
 *
 * 抽成纯函数是为了在 node 环境里钉住「循环」这一条——↑ 在首项回到末项、↓ 在末项回到首项，
 * 空表没有可落点（-1）。组件只负责用它的返回值更新高亮项。
 */
export type SelectNavDelta = 1 | -1

/**
 * 循环步进一位。
 *
 * `current` 失效（-1 或越界）时按「从表外进入」处理：↓ 落到首项、↑ 落到末项——
 * 值不在选项表里时（保存的音色被系统卸载）第一次按键不该从 -1 起跳。空表返回 -1。
 */
export function nextIndex(current: number, delta: SelectNavDelta, length: number): number {
  if (length <= 0) return -1
  if (!Number.isInteger(current) || current < 0 || current >= length) {
    return delta === 1 ? 0 : length - 1
  }
  return (current + delta + length) % length
}
