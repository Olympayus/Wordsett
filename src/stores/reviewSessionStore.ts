import { create } from 'zustand'
import type { ReviewCardDTO } from '../services/reviewService'
import type { ReviewStrategy, Template } from '../lib/review/types'

export type SessionPhase = 'overview' | 'answering' | 'rated' | 'summary'

export interface AnsweredEntry {
  cardId: string
  rating: number
  template: Template
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
  answerCurrent: (rating: number) => void
  advance: () => void
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
  answerCurrent: (rating) => {
    const { queue, index, answered } = get()
    const card = queue[index]
    if (!card) return
    set({ answered: [...answered, { cardId: card.cardId, rating, template: card.template }], phase: 'rated' })
  },
  advance: () => {
    const { index, queue } = get()
    const next = index + 1
    if (next >= queue.length) set({ phase: 'summary' })
    else set({ index: next, phase: 'answering' })
  },
  reset: () => set({ phase: 'overview', sessionStrategy: null, queue: [], index: 0, answered: [], startedAt: null }),
}))
