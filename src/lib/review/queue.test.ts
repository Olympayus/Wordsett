import { describe, it, expect } from 'vitest'
import { buildQueue } from './queue'
import type { QueueCandidate } from './queue'
import type { InitialFamiliarity, Template } from './types'

const MS_PER_DAY = 86_400_000
const NOW = 1_700_000_000_000

const cand = (o: Partial<QueueCandidate> & { cardId: string }): QueueCandidate => ({
  wordId: `w_${o.cardId}`,
  stability: 10,
  dueAt: NOW - MS_PER_DAY,
  lastReviewAt: NOW - 10 * MS_PER_DAY,
  initialFamiliarity: 1 as InitialFamiliarity,
  availableTemplates: ['recognize'] as Template[],
  ...o,
})

const params = { now: NOW, newCardQuota: 10, queueLimit: 30 }

describe('review/queue', () => {
  it('到期卡按 R_now 升序：逾期越久越靠前', () => {
    const r = buildQueue([
      cand({ cardId: 'a', stability: 100, lastReviewAt: NOW - 90 * MS_PER_DAY, dueAt: NOW - 90 * MS_PER_DAY }),
      cand({ cardId: 'b', stability: 20, lastReviewAt: NOW - MS_PER_DAY, dueAt: NOW - MS_PER_DAY }),
    ], params)
    expect(r.queue.map(c => c.cardId)).toEqual(['a', 'b'])
  })

  it('未到期且非新卡的词不进队列', () => {
    const r = buildQueue([cand({ cardId: 'a', dueAt: NOW + MS_PER_DAY })], params)
    expect(r.queue).toHaveLength(0)
    expect(r.dueCount).toBe(0)
  })

  it('新卡（stability 为 null）按熟悉度升序，完全陌生优先', () => {
    const r = buildQueue([
      cand({ cardId: 'a', stability: null, initialFamiliarity: 3 }),
      cand({ cardId: 'b', stability: null, initialFamiliarity: 1 }),
      cand({ cardId: 'c', stability: null, initialFamiliarity: 2 }),
    ], params)
    // R_now 0.15 / 0.45 / 0.75 升序 → b, c, a
    expect(r.queue.map(c => c.cardId)).toEqual(['b', 'c', 'a'])
    expect(r.newCount).toBe(3)
  })

  it('无可用模板的词缺席，不计入队列', () => {
    const r = buildQueue([
      cand({ cardId: 'a', availableTemplates: [] }),
      cand({ cardId: 'b' }),
    ], params)
    expect(r.queue.map(c => c.cardId)).toEqual(['b'])
    expect(r.absentCount).toBe(1)
  })

  it('新卡额度为 0 且无到期卡 → 空队列，不报错', () => {
    const r = buildQueue(
      [cand({ cardId: 'a', stability: null })],
      { ...params, newCardQuota: 0 },
    )
    expect(r.queue).toEqual([])
    expect(r.newCount).toBe(0)
    expect(r.absentCount).toBe(0)
  })

  it('新卡额度限制生效', () => {
    const fresh = Array.from({ length: 5 }, (_, i) =>
      cand({ cardId: `n${i}`, stability: null, initialFamiliarity: 1 }))
    const r = buildQueue(fresh, { ...params, newCardQuota: 2 })
    expect(r.newCount).toBe(2)
    expect(r.queue).toHaveLength(2)
  })

  it('到期卡优先占满剩余额度，不被新卡挤掉', () => {
    const due = Array.from({ length: 5 }, (_, i) => cand({ cardId: `d${i}` }))
    const fresh = Array.from({ length: 5 }, (_, i) =>
      cand({ cardId: `n${i}`, stability: null, initialFamiliarity: 1 }))
    const r = buildQueue([...due, ...fresh], { now: NOW, newCardQuota: 2, queueLimit: 5 })
    expect(r.newCount).toBe(2)
    expect(r.dueCount).toBe(3)   // 5 - 2
    expect(r.queue).toHaveLength(5)
  })

  it('队列上限小于新卡额度时，总数仍不超上限', () => {
    const fresh = Array.from({ length: 10 }, (_, i) =>
      cand({ cardId: `n${i}`, stability: null, initialFamiliarity: 1 }))
    const r = buildQueue(fresh, { now: NOW, newCardQuota: 10, queueLimit: 3 })
    expect(r.queue).toHaveLength(3)
  })

  it('queueLimit 为 0 表示不限', () => {
    const due = Array.from({ length: 50 }, (_, i) => cand({ cardId: `d${i}` }))
    const r = buildQueue(due, { now: NOW, newCardQuota: 0, queueLimit: 0 })
    expect(r.queue).toHaveLength(50)
  })

  it('输出按 R_now 升序统一排列', () => {
    const r = buildQueue([
      cand({ cardId: 'due', stability: 100, lastReviewAt: NOW - 90 * MS_PER_DAY, dueAt: NOW - 90 * MS_PER_DAY }),
      cand({ cardId: 'fresh', stability: null, initialFamiliarity: 1 }),
    ], params)
    // 新卡 R_now = 0.15，熟词 R_now = exp(-0.9) ≈ 0.41 → 新卡在前
    expect(r.queue.map(c => c.cardId)).toEqual(['fresh', 'due'])
  })
})
