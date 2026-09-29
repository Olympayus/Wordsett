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
  template: 'recognize' as Template,
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

  it('新卡额度为 0 且无到期卡 → 空队列，不报错', () => {
    const r = buildQueue(
      [cand({ cardId: 'a', stability: null })],
      { ...params, newCardQuota: 0 },
    )
    expect(r.queue).toEqual([])
    expect(r.newCount).toBe(0)
  })

  it('新卡额度限制生效', () => {
    const fresh = Array.from({ length: 5 }, (_, i) =>
      cand({ cardId: `n${i}`, stability: null, initialFamiliarity: 1 }))
    const r = buildQueue(fresh, { ...params, newCardQuota: 2 })
    expect(r.newCount).toBe(2)
    expect(r.queue).toHaveLength(2)
  })

  it('新卡先占额度，到期卡填剩余', () => {
    const due = Array.from({ length: 5 }, (_, i) => cand({ cardId: `d${i}` }))
    const fresh = Array.from({ length: 5 }, (_, i) =>
      cand({ cardId: `n${i}`, stability: null, initialFamiliarity: 1 }))
    const r = buildQueue([...due, ...fresh], { now: NOW, newCardQuota: 2, queueLimit: 5 })
    expect(r.newCount).toBe(2)
    expect(r.dueCount).toBe(3)   // 5 - 2：额度先被新卡占 2 张，剩 3 张归到期卡
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

  it('includeNotDue：未到期的熟词默认排除，置位后进到期池并按 R_now 升序', () => {
    // afar 逾期 90 天（R_now 更低）在前，near 明天才到期（R_now 更高）在后
    const pool = [
      cand({ cardId: 'near', stability: 10, lastReviewAt: NOW, dueAt: NOW + MS_PER_DAY }),
      cand({ cardId: 'afar', stability: 10, lastReviewAt: NOW - 90 * MS_PER_DAY, dueAt: NOW + MS_PER_DAY }),
    ]
    const off = buildQueue(pool, { now: NOW, newCardQuota: 0, queueLimit: 30 })
    expect(off.queue).toEqual([])
    expect(off.dueCount).toBe(0)

    const on = buildQueue(pool, { now: NOW, newCardQuota: 0, queueLimit: 30, includeNotDue: true })
    expect(on.queue.map(c => c.cardId)).toEqual(['afar', 'near'])
    expect(on.dueCount).toBe(2)
    expect(on.newCount).toBe(0)
  })

  it('includeNotDue 不放宽新卡：stability 为 null 的仍走新卡额度', () => {
    const r = buildQueue(
      [cand({ cardId: 'fresh', stability: null, initialFamiliarity: 1 })],
      { now: NOW, newCardQuota: 0, queueLimit: 30, includeNotDue: true },
    )
    expect(r.queue).toEqual([])
    expect(r.dueCount).toBe(0)
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

describe('每词每轮至多一张卡', () => {
  it('同一个词的三张到期卡只出一张，其余轮的 due_at 不受影响', () => {
    const r = buildQueue([
      cand({ cardId: 'a', wordId: 'w1', template: 'recognize', stability: 5, dueAt: NOW - 30 * MS_PER_DAY, lastReviewAt: NOW - 30 * MS_PER_DAY }),
      cand({ cardId: 'b', wordId: 'w1', template: 'cloze',     stability: 5, dueAt: NOW - 20 * MS_PER_DAY, lastReviewAt: NOW - 20 * MS_PER_DAY }),
      cand({ cardId: 'c', wordId: 'w1', template: 'recall',    stability: 5, dueAt: NOW - 10 * MS_PER_DAY, lastReviewAt: NOW - 10 * MS_PER_DAY }),
    ], params)
    expect(r.queue).toHaveLength(1)
    // 选出的是 R_now 最低的那张（逾期最久 = 最记不住）
    expect(r.queue[0].cardId).toBe('a')
    expect(r.dueCount).toBe(1)
  })

  it('不同词的卡各出一张，互不挤占', () => {
    // queueLimit 1 制造稀缺：w1 抢到唯一的名额，w1 的另一张与 w2 都得让路——
    // 「互不挤占」指名额是按词独占的，不是「一个词只能出一张」。
    const r = buildQueue([
      cand({ cardId: 'a', wordId: 'w1' }),
      cand({ cardId: 'b', wordId: 'w2' }),
      cand({ cardId: 'c', wordId: 'w1', template: 'cloze' }),
    ], { ...params, queueLimit: 1 })
    expect(r.queue).toHaveLength(1)
    expect(new Set(r.queue.map(c => c.wordId)).size).toBe(1)
  })
})

describe('新词额度按词算', () => {
  it('额度 2 时取 2 个新词，每词本轮只出一张', () => {
    const r = buildQueue([
      cand({ cardId: 'a1', wordId: 'w1', stability: null, dueAt: 0, lastReviewAt: null, template: 'recognize' }),
      cand({ cardId: 'a2', wordId: 'w1', stability: null, dueAt: 0, lastReviewAt: null, template: 'cloze' }),
      cand({ cardId: 'b1', wordId: 'w2', stability: null, dueAt: 0, lastReviewAt: null }),
      cand({ cardId: 'c1', wordId: 'w3', stability: null, dueAt: 0, lastReviewAt: null }),
    ], { ...params, newCardQuota: 2 })
    expect(r.newCount).toBe(2)
    expect(r.queue.every(c => c.stability === null)).toBe(true)
    expect(new Set(r.queue.map(c => c.wordId)).size).toBe(2)
  })

  it('新词额度 0 = 只还旧账', () => {
    const r = buildQueue([
      cand({ cardId: 'a', wordId: 'w1' }),
      cand({ cardId: 'b', wordId: 'w2', stability: null, dueAt: 0, lastReviewAt: null }),
    ], { ...params, newCardQuota: 0 })
    expect(r.newCount).toBe(0)
    expect(r.queue.map(c => c.cardId)).toEqual(['a'])
  })

  it('到期优先：同一个词既有到期卡又有新卡时，本轮只出到期那张', () => {
    const r = buildQueue([
      cand({ cardId: 'due', wordId: 'w1', template: 'recognize' }),
      cand({ cardId: 'new', wordId: 'w1', template: 'cloze', stability: null, dueAt: 0, lastReviewAt: null }),
      cand({ cardId: 'other', wordId: 'w2', stability: null, dueAt: 0, lastReviewAt: null }),
    ], params)
    const forW1 = r.queue.filter(c => c.wordId === 'w1')
    expect(forW1).toHaveLength(1)
    expect(forW1[0].cardId).toBe('due')
  })

  it('额度 3 但其中一个新词另有到期卡 → 本轮只出 2 张新卡（M − K）', () => {
    const r = buildQueue([
      cand({ cardId: 'due1', wordId: 'w1' }),
      cand({ cardId: 'n1', wordId: 'w1', stability: null, dueAt: 0, lastReviewAt: null }),
      cand({ cardId: 'n2', wordId: 'w2', stability: null, dueAt: 0, lastReviewAt: null }),
      cand({ cardId: 'n3', wordId: 'w3', stability: null, dueAt: 0, lastReviewAt: null }),
    ], { ...params, newCardQuota: 3 })
    // 判据是整池：w1 池里有到期卡 → 它的本轮新卡让位，哪怕那张到期卡排得上
    expect(r.newCount).toBe(2)
    expect(r.dueCount).toBe(1)
    expect(r.queue.filter(c => c.stability === null).map(c => c.wordId).sort()).toEqual(['w2', 'w3'])
  })

  it('额度封顶只保上限不保配额：M 个新词全被让位时本轮一张新卡都不出', () => {
    // 钉住保守判据的真下界：最坏情况 newCount = 0（M 个新词都另有到期卡）。
    // 欠配额不超发，且这些词只是推迟、不会丢——评过到期卡后下一轮即补位。
    const r = buildQueue([
      cand({ cardId: 'due1', wordId: 'w1' }),
      cand({ cardId: 'n1', wordId: 'w1', stability: null, dueAt: 0, lastReviewAt: null }),
      cand({ cardId: 'due2', wordId: 'w2' }),
      cand({ cardId: 'n2', wordId: 'w2', stability: null, dueAt: 0, lastReviewAt: null }),
    ], { ...params, newCardQuota: 2 })
    expect(r.newCount).toBe(0)
    expect(r.dueCount).toBe(2)
    expect(r.queue.map(c => c.cardId).sort()).toEqual(['due1', 'due2'])

    // 自我修正：两张到期卡评完 → due_at 推后、不再命中整池判据 → w1/w2 的新卡当轮补位
    const reviewed = ['due1', 'due2'].map(id => {
      const c = r.queue.find(x => x.cardId === id)!
      return { ...c, stability: 10, lastReviewAt: NOW, dueAt: NOW + 5 * MS_PER_DAY }
    })
    const stillFresh = ['n1', 'n2'].map(id => {
      const c = cand({ cardId: id })
      return { ...c, wordId: id === 'n1' ? 'w1' : 'w2', stability: null, dueAt: 0, lastReviewAt: null }
    })
    const next = buildQueue([...reviewed, ...stillFresh], { now: NOW, newCardQuota: 2, queueLimit: 0 })
    expect(next.newCount).toBe(2)
    expect(next.queue.filter(c => c.stability === null).map(c => c.wordId).sort()).toEqual(['w1', 'w2'])
  })

  it('队列长度受 queueLimit 封顶（每词每轮一张之后按卡数算）', () => {
    const many = Array.from({ length: 40 }, (_, i) => cand({ cardId: `c${i}`, wordId: `w${i}` }))
    const r = buildQueue(many, params)
    expect(r.queue).toHaveLength(30)
  })
})
