// 浏览器式前进 / 后退历史栈（v0.5.2 §6）。纯函数，无 store、无 React 依赖，便于单测。

export interface NavHistory {
  /** 访问过的词条 id，由旧到新 */
  entries: string[]
  /** 当前指向 entries 的下标；空栈为 -1 */
  index: number
}

/** 栈深上限，超出时丢弃最旧记录 */
export const HISTORY_LIMIT = 50

export const EMPTY_HISTORY: NavHistory = { entries: [], index: -1 }

export function current(h: NavHistory): string | null {
  return h.index >= 0 ? (h.entries[h.index] ?? null) : null
}

export function canGoBack(h: NavHistory): boolean {
  return h.index > 0
}

export function canGoForward(h: NavHistory): boolean {
  return h.index >= 0 && h.index < h.entries.length - 1
}

/** 入栈。与当前项相同则不动；否则截断前进分支后追加，并裁剪至上限。 */
export function push(h: NavHistory, id: string): NavHistory {
  if (current(h) === id) return h
  const kept = h.entries.slice(0, h.index + 1)     // 浏览器行为：丢掉已回退掉的分支
  const entries = [...kept, id]
  let index = entries.length - 1
  const overflow = entries.length - HISTORY_LIMIT
  if (overflow > 0) {
    return { entries: entries.slice(overflow), index: index - overflow }
  }
  return { entries, index }
}

export function back(h: NavHistory): NavHistory {
  return canGoBack(h) ? { entries: h.entries, index: h.index - 1 } : h
}

export function forward(h: NavHistory): NavHistory {
  return canGoForward(h) ? { entries: h.entries, index: h.index + 1 } : h
}

/**
 * 移除某词条的全部记录（删除词条后调用，避免回退落到空词条）。
 * 指针语义：删掉的记录若位于当前项之前，指针左移相同条数；
 * 若删的正是当前项，再退一条；最后裁到合法范围。
 */
export function removeId(h: NavHistory, id: string): NavHistory {
  const removedBefore = h.entries.slice(0, Math.max(h.index, 0)).filter(e => e === id).length
  if (removedBefore === 0 && h.entries[h.index] !== id) return h
  const entries = h.entries.filter(e => e !== id)
  if (entries.length === 0) return EMPTY_HISTORY
  let index = h.index - removedBefore
  if (h.entries[h.index] === id) index = Math.max(0, index - 1)
  index = Math.min(Math.max(index, 0), entries.length - 1)
  return { entries, index }
}
