import { create } from 'zustand'

/**
 * 划词句子模式下「打开详情页」带过来的整句（v0.7.9）。
 *
 * 主窗详情页读到它时（`GrabbedSentenceBar`）在词典页顶部出一条「划词例句」条，
 * 允许把这句话挂到所选释义的例句下——小窗里能做到的事，详情页里同样能做。
 *
 * 生命周期由生产者与消费者共同管：`open-dict`（带句子）写入，挂入成功 / 换词 /
 * 不带句子的 `open-dict` 清空。不做持久化：它是两次交互之间的瞬态交接，不是设置。
 */
export interface PendingExample {
  /** 句子模式当前的目标词（详情页显示的就是它）。 */
  word: string
  /** 抓取到的整句原文（清洗后）。 */
  sentence: string
}

interface PendingExampleState {
  pending: PendingExample | null
  set: (pending: PendingExample) => void
  clear: () => void
}

export const usePendingExampleStore = create<PendingExampleState>(set => ({
  pending: null,
  set: pending => set({ pending }),
  clear: () => set({ pending: null }),
}))
