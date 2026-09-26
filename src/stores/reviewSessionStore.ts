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
  /** 分类强化的多选目标（v0.6.2 条目 10）。并集出题；其他 kind 不用。 */
  categoryIds?: string[]
  limit?: number
}

interface ReviewSessionStore {
  /** 当前查看的策略 */
  strategy: ReviewStrategy
  /**
   * 会话所属策略；null = 没有进行中的会话。
   *
   * 本 store 的 setStrategy 确实原样保留 queue / answered——但那只是这一层字段的行为，
   * **不是用户能摸到的行为**：v0.6.2 起 SessionGuard 会拦下切走的点击并询问，确认后走
   * reset()，刚保留下的队列当场被清掉（§2.4 已废）。别把这里的「保留」当产品承诺写进文案。
   */
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
  startSession: (queue: ReviewCardDTO[], scope?: FreeScope | null) => void
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

  // 只切「看哪个策略」；本 store 确实不动进行中的会话（queue / answered 原样留着）。
  // 但用户走不到「切回即续」那条路：SessionGuard 会先拦下这次点击、确认后 reset() 清场（v0.6.2 §5.2，取代 v0.6 spec §2.4）
  setStrategy: (strategy) => set({ strategy }),
  setPhase: (phase) => set({ phase }),
  setFreeScope: (freeScope) => set({ freeScope }),
  // scope 是本轮的范围（null = 无范围的今日复习）。收进这一次 set：范围与队列同一刻落定，
  // 调用方就不必记得在 startSession 之前先写一次 freeScope——两处分写时，正确性会吊在
  // 另一个模块 scopeLabel 的 strategy === 'today' 短路分支上。
  startSession: (queue, scope = null) => set({ queue, index: 0, answered: [], phase: 'answering', startedAt: Date.now(), sessionStrategy: get().strategy, freeScope: scope }),
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
  // freeScope 随会话一起清：它描述的是「本轮的范围」，reset 就是结束本轮的地方。
  // 不清的话，将来任何「保留 sessionStrategy 只重置 phase」的路径都会把上一轮的范围名
  // 漏到新一轮的控制台上。
  reset: () => set({ phase: 'overview', sessionStrategy: null, queue: [], index: 0, answered: [], freeScope: null, startedAt: null }),
}))
