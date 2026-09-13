import { create } from 'zustand'
import {
  EMPTY_HISTORY, push, back, forward, removeId, current,
  canGoBack, canGoForward,
  type NavHistory,
} from '../lib/navHistory'

interface NavHistoryStore {
  history: NavHistory
  /** 记录一次工作台内的词条切换 */
  record: (id: string) => void
  /** 回退一格并返回目标词条 id；到头返回 null */
  goBack: () => string | null
  /** 前进一格并返回目标词条 id；到头返回 null */
  goForward: () => string | null
  /** 删除词条后清理其历史记录 */
  dropId: (id: string) => void
  reset: () => void
}

// 只记工作台内的词条切换（v0.5.2 §6）：词典页访问不入栈。
// 由 wordStore.selectWord 在 id 变化时调用 record；箭头导航调用时传 record:false。
export const useNavHistoryStore = create<NavHistoryStore>((set, get) => ({
  history: EMPTY_HISTORY,
  record: (id) => set(s => ({ history: push(s.history, id) })),
  goBack: () => {
    // navHistory.back 到头时钳位不动，这里先判方向，到头返回 null（接口约定）
    if (!canGoBack(get().history)) return null
    const next = back(get().history)
    set({ history: next })
    return current(next)
  },
  goForward: () => {
    if (!canGoForward(get().history)) return null
    const next = forward(get().history)
    set({ history: next })
    return current(next)
  },
  dropId: (id) => set(s => ({ history: removeId(s.history, id) })),
  reset: () => set({ history: EMPTY_HISTORY }),
}))