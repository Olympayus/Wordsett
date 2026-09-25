import { create } from 'zustand'
import type { ReviewCardDTO } from '../services/reviewService'
import type { ReviewStrategy, Template } from '../lib/review/types'

export type SessionPhase = 'overview' | 'answering' | 'rated' | 'summary'

export interface AnsweredEntry {
  cardId: string
  rating: number
  template: Template
  /**
   * 用户当时的作答原文（选择题＝选中的选项文本；键入题＝键入内容；揭示型与跳过＝''）。
   * 回看已答题时要靠它重建结果区（spec §4.1）；对错不另存，可由 input + DTO 现场派生。
   */
  input: string
}

export interface FreeScope {
  kind: 'category' | 'random' | 'today' | 'weak'
  categoryId?: string
  limit?: number
}

interface ReviewSessionStore {
  /** 当前查看的策略 */
  strategy: ReviewStrategy
  /** 会话所属策略；null = 没有进行中的会话。切走的会话仍保留 queue/answered，切回即续。 */
  sessionStrategy: ReviewStrategy | null
  phase: SessionPhase
  queue: ReviewCardDTO[]
  index: number
  answered: AnsweredEntry[]
  freeScope: FreeScope | null
  startedAt: number | null

  setStrategy: (s: ReviewStrategy) => void
  setPhase: (p: SessionPhase) => void
  setFreeScope: (s: FreeScope | null) => void
  startSession: (queue: ReviewCardDTO[]) => void
  answerCurrent: (rating: number, input: string) => void
  advance: () => void
  /** 导航条跳题：只改题号并把 phase 拨回 'answering'（不重排 answered，只读导航不记账）。 */
  setIndex: (i: number) => void
  reset: () => void
}

export const useReviewSessionStore = create<ReviewSessionStore>((set, get) => ({
  strategy: 'today',
  sessionStrategy: null,
  phase: 'overview',
  queue: [],
  index: 0,
  answered: [],
  freeScope: null,
  startedAt: null,

  // 只切「看哪个策略」；进行中的会话原地保留，切回该策略即续（规格 §2.4）
  setStrategy: (strategy) => set({ strategy }),
  setPhase: (phase) => set({ phase }),
  setFreeScope: (freeScope) => set({ freeScope }),
  startSession: (queue) => set({ queue, index: 0, answered: [], phase: 'answering', startedAt: Date.now(), sessionStrategy: get().strategy }),
  answerCurrent: (rating, input) => {
    const { queue, index, answered } = get()
    const card = queue[index]
    if (!card) return
    set({ answered: [...answered, { cardId: card.cardId, rating, template: card.template, input }], phase: 'rated' })
  },
  advance: () => {
    const { index, queue } = get()
    const next = index + 1
    if (next >= queue.length) set({ phase: 'summary' })
    else set({ index: next, phase: 'answering' })
  },
  // 跳题与 advance 同一动作面：越界不搬，越界之外把 phase 拨回 'answering'，
  // 让回看态（已答 + answering）与待推进态（已答 + rated）都落回各自判据
  setIndex: (i) => {
    const { queue } = get()
    if (i < 0 || i >= queue.length) return
    set({ index: i, phase: 'answering' })
  },
  reset: () => set({ phase: 'overview', sessionStrategy: null, queue: [], index: 0, answered: [], startedAt: null }),
}))
