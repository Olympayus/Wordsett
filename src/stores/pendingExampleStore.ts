import { create } from 'zustand'

/**
 * 划词句子模式下「打开详情页」带过来的整句（v0.7.9）。
 *
 * 主窗详情页读到它时（`GrabbedSentenceBar`）在词典页顶部出一条「划词例句」条，
 * 允许把这句话挂到所选释义的例句下——小窗里能做到的事，详情页里同样能做。
 *
 * `attach` 是横幅里**当前选中的释义**（「不添加」时为 null）。它存在 store 而不是
 * 组件局部状态：导航条的「添加」合并路径也要读它——用户在横幅里选了哪条释义，
 * 导航条合并时就把例句挂到哪条，而不是去猜树里的勾选（用户裁定，树里没有多选语义）。
 *
 * 生命周期由生产者与消费者共同管：`open-dict`（带句子）写入，挂入成功 / 不带句子的
 * `open-dict` 清空。不做持久化：它是两次交互之间的瞬态交接，不是设置。
 */
export interface PendingAttach {
  /** 目标释义在释义树里的路径键（`collectorMergeInputs` 用它补父级链）。 */
  pathKey: string
  /** 释义字段（写库时用）。 */
  fieldKey: 'chinese_definition' | 'english_definition'
  value: string
}

export interface PendingExample {
  /** 句子模式当前的目标词（详情页显示的就是它）。 */
  word: string
  /** 抓取到的整句原文（清洗后）。 */
  sentence: string
  /** 横幅里当前选中的释义；null = 不添加。 */
  attach: PendingAttach | null
}

interface PendingExampleState {
  pending: PendingExample | null
  set: (pending: { word: string; sentence: string }) => void
  setAttach: (attach: PendingAttach | null) => void
  clear: () => void
}

export const usePendingExampleStore = create<PendingExampleState>(set => ({
  pending: null,
  // 新一次交接：选择从未选（「不添加」）开始，避免沿用上一次抓取的选择。
  set: ({ word, sentence }) => set({ pending: { word, sentence, attach: null } }),
  setAttach: attach => set(state => (state.pending ? { pending: { ...state.pending, attach } } : state)),
  clear: () => set({ pending: null }),
}))
