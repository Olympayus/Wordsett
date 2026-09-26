import { describe, it, expect } from 'vitest'
import { dayTotal, dayAccuracy, isTrendSparse, subtitleFor, type DayRating, type RoundStatsInput } from './trend'

const day = (again: number, hard: number, good: number): DayRating => ({ day: '2026-09-25', again, hard, good })

describe('lib/review/trend', () => {
  it('复习量＝again + hard + good（rating 4 已由数据层折进 good）', () => {
    expect(dayTotal(day(1, 2, 3))).toBe(6)
    expect(dayTotal(day(0, 0, 0))).toBe(0)
  })

  it('正确率＝good / 总数，与 templateAccuracy 的「rating ≥ 3 算对」同口径', () => {
    // good 3 / 总 6 = 0.5。hard（rating 2）不计入分子——与 templateAccuracy 一样只看 rating ≥ 3。
    expect(dayAccuracy(day(1, 2, 3))).toBeCloseTo(0.5)
    expect(dayAccuracy(day(0, 0, 4))).toBe(1)     // 全记得
    expect(dayAccuracy(day(4, 0, 0))).toBe(0)     // 全忘了
    // 全 hard + 全 again 都不算对
    expect(dayAccuracy(day(2, 2, 0))).toBe(0)
  })

  it('正确率在无评分的空日不除零', () => {
    expect(dayAccuracy(day(0, 0, 0))).toBe(0)
  })

  it('稀疏判定与 StatsMini 一致：样本 < 3 天且无到期压力才占位', () => {
    const noDue = [0, 0, 0, 0, 0, 0, 0, 0]
    // 两个活跃日 + 无到期：三图与趋势条都判稀疏，不该一个画曲线一个写「数据积累中」
    expect(isTrendSparse([day(1, 0, 0), day(0, 0, 1)], noDue)).toBe(true)
    // 样本满 3 天 → 不稀疏
    expect(isTrendSparse([day(1, 0, 0), day(0, 0, 1), day(0, 1, 0)], noDue)).toBe(false)
    // 样本不足但有到期压力 → 不稀疏（有东西可看）
    expect(isTrendSparse([day(1, 0, 0)], [0, 3, 0, 0, 0, 0, 0, 0])).toBe(false)
    // 空库 → 稀疏
    expect(isTrendSparse([], noDue)).toBe(true)
  })
})

describe('四宫格卡片的补充文字（v0.6.2 条目 9）', () => {
  const stats: RoundStatsInput = {
    masteryBuckets: [10, 20, 30, 40, 50],           // 五档，合计 150
    dueByDay: [0, 5, 22, 17, 9, 5, 3, 1],           // 第 0 天是今天
    recentRatings: [
      { day: 'd1', again: 1, hard: 2, good: 3 },    // 6 张
      { day: 'd2', again: 0, hard: 1, good: 5 },    // 6 张
    ],
  }

  it('熟知度分布卡报出总词数与两段计数', () => {
    const s = subtitleFor('mastery', stats)
    expect(s).toContain('150 词')
    // 熟悉及以上 = 后三档（索引 2、3、4）= 30+40+50
    expect(s).toContain('120 词')
  })

  it('明日压力卡报出合计张数与峰值', () => {
    const s = subtitleFor('due', stats)
    expect(s).toContain('62 张')      // 5+22+17+9+5+3+1=62，不含今天的 0（brief 写的 78 是笔误）
    expect(s).toContain('第 2 天')     // 峰值 22 在 dueByDay 的索引 2
  })

  it('趋势卡报出合计与平均正确率', () => {
    const s = subtitleFor('trend', stats)
    expect(s).toContain('12 张')      // 6 + 6
    expect(s).toContain('%')
  })

  it('评分卡报出合计与加权均值', () => {
    const s = subtitleFor('rating', stats)
    expect(s).toContain('12 张')
    // 加权 = Σ(good + hard×0.5) / Σ(again+hard+good)
    //       = (3+2×0.5 + 5+1×0.5) / 12 = 9.5/12 = 0.7916… → 0.8
    expect(s).toContain('0.8')
  })

  it('全部为空时不抛异常，给「数据积累中」这类兜底文案', () => {
    const empty: RoundStatsInput = { masteryBuckets: [], dueByDay: [], recentRatings: [] }
    for (const k of ['rating', 'due', 'mastery', 'trend'] as const) {
      expect(() => subtitleFor(k, empty)).not.toThrow()
      expect(subtitleFor(k, empty).length).toBeGreaterThan(0)
    }
  })
})
