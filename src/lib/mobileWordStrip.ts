/**
 * 词条条的滑动窗口（Task 5）。
 *
 * 手机顶栏下那条常驻的横向词条条一次只画 `size` 枚词片（本仓取 5，见 `WordStrip`）：
 * 全画既浪费又让选中片被挤到屏幕外。这里只决定**画哪一段**——选中片尽量居中，
 * 两端不越界（词数不足一段时从 0 起）。
 *
 * 抽成纯函数是为了让边界可直接测（任务书的四条用例）：居中 / 末尾 / 开头 / 空表。
 */

export interface StripWindow<T> {
  items: T[]
  /** 本段第一项在整表里的下标（词条条据此算「当前分组内的序号」）。 */
  start: number
  total: number
}

/**
 * @param items       整表（词条条只画其中一段，这里**不排序**——顺序由调用方的分组决定）
 * @param activeIndex 选中项在整表里的下标；越界（含空表）一律当 0
 * @param size        一段画几枚；非正数时退化成「一段都不画」，避免 `slice` 的负步长语义
 */
export function stripWindow<T>(items: readonly T[], activeIndex: number, size: number): StripWindow<T> {
  const total = items.length
  const half = Math.floor(size / 2)
  const last = Math.max(0, total - size)
  // 越界（负数 / 超出表长 / NaN）先落回 0，再与 [0, last] 取交：两道夹逼之后 start 必在表内。
  const index = Number.isFinite(activeIndex) ? activeIndex : 0
  const start = Math.min(Math.max(index - half, 0), last)
  return { items: items.slice(start, start + size), start, total }
}
