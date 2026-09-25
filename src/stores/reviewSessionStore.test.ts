import { describe, it, expect, beforeEach } from 'vitest'
import { useReviewSessionStore } from './reviewSessionStore'
import type { ReviewCardDTO } from '../services/reviewService'
import type { Template } from '../lib/review/types'

function makeCard(i: number, template: Template = 'recall'): ReviewCardDTO {
  return {
    cardId: `card-${i}`,
    wordId: `word-${i}`,
    template,
    prompt: {},
    answer: {},
    sched: { dueAt: 0, reps: 0, lapses: 0, lastReviewAt: null, mastery: null, rNow: 1 },
  }
}

const QUEUE: ReviewCardDTO[] = [makeCard(1), makeCard(2, 'cloze'), makeCard(3)]

const INITIAL = {
  strategy: 'today' as const,
  sessionStrategy: null,
  phase: 'overview' as const,
  queue: [] as ReviewCardDTO[],
  index: 0,
  answered: [],
  freeScope: null,
  startedAt: null,
}

describe('reviewSessionStore 策略切换保留会话（规格 §2.4）', () => {
  beforeEach(() => {
    useReviewSessionStore.setState({ ...INITIAL, queue: [], answered: [] })
  })

  it('startSession 记录会话所属策略并进入 answering', () => {
    useReviewSessionStore.getState().setStrategy('free')
    useReviewSessionStore.getState().startSession(QUEUE)
    const s = useReviewSessionStore.getState()
    expect(s.sessionStrategy).toBe('free')
    expect(s.phase).toBe('answering')
    expect(s.queue).toHaveLength(3)
    expect(s.startedAt).not.toBeNull()
  })

  it('切到别的策略：queue / answered / index / phase 原样保留（会话暂停）', () => {
    useReviewSessionStore.getState().startSession(QUEUE)
    useReviewSessionStore.getState().answerCurrent(3, '')
    useReviewSessionStore.getState().advance()
    const before = useReviewSessionStore.getState()

    useReviewSessionStore.getState().setStrategy('free')

    const s = useReviewSessionStore.getState()
    expect(s.strategy).toBe('free')
    expect(s.sessionStrategy).toBe('today')
    expect(s.phase).toBe(before.phase)
    expect(s.index).toBe(before.index)
    expect(s.queue).toEqual(before.queue)
    expect(s.answered).toEqual(before.answered)
  })

  it('切回会话所属策略即续：仍在原位、原 phase', () => {
    useReviewSessionStore.getState().startSession(QUEUE)
    useReviewSessionStore.getState().answerCurrent(3, '')
    useReviewSessionStore.getState().advance()
    const paused = useReviewSessionStore.getState()

    useReviewSessionStore.getState().setStrategy('free')
    useReviewSessionStore.getState().setStrategy('today')

    const s = useReviewSessionStore.getState()
    expect(s.strategy).toBe('today')
    expect(s.sessionStrategy).toBe('today')
    expect(s.index).toBe(paused.index)
    expect(s.phase).toBe(paused.phase)
    expect(s.answered).toHaveLength(1)
  })

  it('切走后 answered 继续按原样累计，不被清空', () => {
    useReviewSessionStore.getState().startSession(QUEUE)
    useReviewSessionStore.getState().answerCurrent(3, '')
    useReviewSessionStore.getState().setStrategy('free')
    useReviewSessionStore.getState().setStrategy('today')
    useReviewSessionStore.getState().answerCurrent(2, '')
    const s = useReviewSessionStore.getState()
    expect(s.answered.map(a => a.rating)).toEqual([3, 2])
    expect(s.answered[0].cardId).toBe('card-1')
  })

  it('reset 清空会话并让 sessionStrategy 归 null，strategy 不动', () => {
    useReviewSessionStore.getState().startSession(QUEUE)
    useReviewSessionStore.getState().answerCurrent(3, '')
    useReviewSessionStore.getState().setStrategy('free')

    useReviewSessionStore.getState().reset()

    const s = useReviewSessionStore.getState()
    expect(s.sessionStrategy).toBeNull()
    expect(s.phase).toBe('overview')
    expect(s.queue).toEqual([])
    expect(s.answered).toEqual([])
    expect(s.index).toBe(0)
    expect(s.startedAt).toBeNull()
    expect(s.strategy).toBe('free')
  })

  it('advance 走完最后一题转 summary，summary 态下切策略不丢会话', () => {
    useReviewSessionStore.getState().startSession([makeCard(1)])
    useReviewSessionStore.getState().answerCurrent(3, '')
    useReviewSessionStore.getState().advance()
    expect(useReviewSessionStore.getState().phase).toBe('summary')

    useReviewSessionStore.getState().setStrategy('free')
    const s = useReviewSessionStore.getState()
    expect(s.phase).toBe('summary')
    expect(s.sessionStrategy).toBe('today')
  })

  it('answerCurrent 在空队列上是空操作', () => {
    useReviewSessionStore.getState().answerCurrent(3, '')
    const s = useReviewSessionStore.getState()
    expect(s.answered).toEqual([])
    expect(s.phase).toBe('overview')
  })
})

describe('会话记账与策略集合', () => {
  it('answerCurrent 记录用户当时的作答原文', () => {
    const s = () => useReviewSessionStore.getState()
    s().reset()
    s().setStrategy('today')
    s().startSession([{ cardId: 'c1', wordId: 'w1', template: 'recognize' } as any])
    s().answerCurrent(1, '懒散的 · 草率的')
    expect(s().answered).toEqual([
      { cardId: 'c1', rating: 1, template: 'recognize', input: '懒散的 · 草率的' },
    ])
  })

  it('跳过路径记空 input', () => {
    const s = () => useReviewSessionStore.getState()
    s().reset()
    s().setStrategy('today')
    s().startSession([{ cardId: 'c1', wordId: 'w1', template: 'recognize' } as any])
    s().answerCurrent(1, '')
    expect(s().answered[0].input).toBe('')
  })
})
