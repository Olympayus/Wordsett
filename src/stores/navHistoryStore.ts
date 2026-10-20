import { create } from 'zustand'
import {
  EMPTY_HISTORY, push, removeId,
  type NavEntry, type NavHistory,
} from '../lib/navHistory'
import type { WordLocation } from '../types/word'

/** 导航时把历史项解析成**当前**所在模块；词条已不在库则返回 null（该项会被丢弃）。 */
export type NavEntryResolver = (id: string) => WordLocation | null

interface NavHistoryStore {
  history: NavHistory
  /** 记录一次工作台内的词条切换（模块随词条一起记，跨模块后退才回得去）。 */
  record: (id: string, location: WordLocation) => void
  /**
   * 回退一格并返回目标词条；到头返回 null。
   *
   * 解析器把每个历史项映射到**库内当前**模块：
   *  · 返回 null（词条已删除 / 已被移出库）→ 丢弃该项，继续朝同方向找；
   *  · 返回的位置与记录时不同（词条被移入 / 移回）→ 用当前位置刷新历史项。
   * 指针只落在解析成功的项上；全方向都无有效项时返回 null、脚本不动。
   */
  goBack: (resolve: NavEntryResolver) => NavEntry | null
  /** 前进一格，语义同 `goBack`（方向相反）。 */
  goForward: (resolve: NavEntryResolver) => NavEntry | null
  /** 删除词条后清理其历史记录 */
  dropId: (id: string) => void
  reset: () => void
}

/**
 * 朝一个方向走一格。先把**整条**历史按解析器过滤一遍（栈深上限 50，代价可忽略）：
 * 删掉的项直接丢弃、移走的项刷新 location；随后在过滤后的数组里朝方向取第一项。
 *
 * 为什么不逐项「走到哪丢到哪」：删除 / 移动会改变下标，边走边删要同时维护两个方向上的
 * 位移补偿；先全量过滤把「项是否还有效」与「指针落在哪」拆成两步，就没有这类算术。
 */
function stepHistory(
  history: NavHistory,
  dir: 'back' | 'forward',
  resolve: NavEntryResolver,
): { history: NavHistory; target: NavEntry | null } {
  const entries: NavEntry[] = []
  let currentIndex = -1
  // 当前项若已被删掉：记录它前面还有多少项存活，指针就落在这条缝里。
  let survivedBeforeCurrent = 0

  for (let i = 0; i < history.entries.length; i++) {
    const entry = history.entries[i]
    const location = resolve(entry.id)
    if (location === null) continue
    if (i < history.index) survivedBeforeCurrent++
    if (i === history.index) currentIndex = entries.length
    entries.push(location === entry.location ? entry : { id: entry.id, location })
  }

  if (entries.length === 0) return { history: EMPTY_HISTORY, target: null }

  const step = dir === 'back' ? -1 : 1
  // 当前项还在：从它旁边出发。当前项被删：落在「它原来那条缝」的对应侧。
  const start = currentIndex >= 0
    ? currentIndex + step
    : survivedBeforeCurrent + (dir === 'back' ? -1 : 0)
  const target = start >= 0 && start < entries.length ? entries[start] : null

  let index: number
  if (target) index = start
  else if (currentIndex >= 0) index = currentIndex
  else index = Math.max(0, Math.min(
    survivedBeforeCurrent - (dir === 'forward' ? 1 : 0),
    entries.length - 1,
  ))

  return { history: { entries, index }, target }
}

// 只记工作台内的词条切换（v0.5.2 §6）：词典页访问不入栈。
// 由 wordStore.selectWord 在 id 变化时调用 record（模块一并记）；箭头导航调用时传 record:false。
export const useNavHistoryStore = create<NavHistoryStore>((set, get) => ({
  history: EMPTY_HISTORY,
  record: (id, location) => set(s => ({ history: push(s.history, { id, location }) })),
  goBack: (resolve) => {
    const next = stepHistory(get().history, 'back', resolve)
    set({ history: next.history })
    return next.target
  },
  goForward: (resolve) => {
    const next = stepHistory(get().history, 'forward', resolve)
    set({ history: next.history })
    return next.target
  },
  dropId: (id) => set(s => ({ history: removeId(s.history, id) })),
  reset: () => set({ history: EMPTY_HISTORY }),
}))
