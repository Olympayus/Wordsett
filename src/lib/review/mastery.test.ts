import { describe, it, expect } from 'vitest'
import { mastery, retrievability, elapsedDaysSince, masteryTier, strengthScore, familiarityTier, displayTier, NEW_CARD_RNOW, defaultRatingFor } from './mastery'

const MS_PER_DAY = 86_400_000

describe('review/mastery', () => {
  it('mastery 是固定视野 7 天的可回忆概率', () => {
    expect(mastery(7)!).toBeCloseTo(Math.exp(-1), 6)
    expect(mastery(30)!).toBeCloseTo(Math.exp(-7 / 30), 6)
    expect(mastery(90)!).toBeCloseTo(Math.exp(-7 / 90), 6)
  })

  it('mastery 随 stability 单调递增', () => {
    expect(mastery(3)!).toBeLessThan(mastery(7)!)
    expect(mastery(7)!).toBeLessThan(mastery(30)!)
    expect(mastery(30)!).toBeLessThan(mastery(300)!)
  })

  it('未首评（S 为 null 或非正）返回 null', () => {
    expect(mastery(null)).toBeNull()
    expect(mastery(0)).toBeNull()
    expect(mastery(-5)).toBeNull()
  })

  it('stability 极小不产生 NaN，结果落在 [0,1]', () => {
    const m = mastery(0.001)
    expect(Number.isNaN(m!)).toBe(false)
    expect(m!).toBeGreaterThanOrEqual(0)
    expect(m!).toBeLessThanOrEqual(1)
  })

  it('retrievability 同时反映强度与逾期程度', () => {
    expect(retrievability(100, 90)).toBeCloseTo(Math.exp(-0.9), 6)
    expect(retrievability(20, 1)).toBeCloseTo(Math.exp(-0.05), 6)
    // 逾期很久的熟词，R_now 低于刚复习过的弱词
    expect(retrievability(100, 90)).toBeLessThan(retrievability(20, 1))
  })

  it('时钟回拨：已过天数为负时 clamp 到 0，R_now 不超过 1', () => {
    const future = Date.now() + 10 * MS_PER_DAY
    expect(elapsedDaysSince(future, Date.now())).toBe(0)
    expect(retrievability(20, -5)).toBeLessThanOrEqual(1)
    expect(retrievability(20, -5)).toBeGreaterThanOrEqual(0)
  })

  it('elapsedDaysSince 未复习返回 0', () => {
    expect(elapsedDaysSince(null, Date.now())).toBe(0)
  })

  it('新卡冷启动映射：越熟悉 R_now 越高', () => {
    expect(NEW_CARD_RNOW[1]).toBeLessThan(NEW_CARD_RNOW[2])
    expect(NEW_CARD_RNOW[2]).toBeLessThan(NEW_CARD_RNOW[3])
  })

  it('masteryTier 分六档，无记录为 0，最高不超过 5', () => {
    // 判据是 stability（天）而非 mastery（0–1）——入参口径变了，边界值也随之重排，
    // 旧用例传 0.2/0.5/0.7 会被读成「0.2 天稳定性」，早已不是同一条分档线。
    // 逐档边界钉在下方「记忆强度 6 档」，此处只留它原本独占的 S ≤ 0 一档。
    expect(masteryTier(0)).toBe(0)   // S ≤ 0 出不了分（mastery 的 ≤ 0 守卫），与 null 同归空档
  })
})

describe('记忆强度 6 档', () => {
  it('强度分 = 100·exp(-7/S)，S 为空时为 null', () => {
    expect(strengthScore(null)).toBeNull()
    expect(strengthScore(0)).toBeNull()
    expect(Math.round(strengthScore(20)!)).toBe(70)   // exp(-0.35) = 0.7047
    expect(Math.round(strengthScore(60)!)).toBe(89)   // exp(-0.1167) = 0.8899
  })

  it('100 分取不到——分档的上界不溢出到 6', () => {
    // 任何有限 S 都够不着 100；再大的 S 也必须落在档 5。
    expect(masteryTier(1e9)).toBe(5)
    expect(masteryTier(1e6)).toBe(5)
  })

  it('6 档边界按 20% 切', () => {
    expect(masteryTier(null)).toBe(0)      // 空档：无记录
    expect(masteryTier(1)).toBe(1)         // 3.0 分
    expect(masteryTier(4)).toBe(1)         // 17.4 分
    expect(masteryTier(5)).toBe(2)         // 24.7 分
    expect(masteryTier(10)).toBe(3)        // 49.7 分
    expect(masteryTier(20)).toBe(4)        // 70.5 分
    expect(masteryTier(50)).toBe(5)        // 86.9 分
  })

  it('冷启动：无 stability 时按熟悉度取档，连熟悉度也没有才是空档', () => {
    expect(displayTier({ stability: null, familiarity: 1 })).toBe(1)
    expect(displayTier({ stability: null, familiarity: 2 })).toBe(2)
    expect(displayTier({ stability: null, familiarity: 3 })).toBe(3)
    expect(displayTier({ stability: 20, familiarity: 3 })).toBe(4)  // 有记录就以记录为准
  })

  it('familiarityTier 直接映射熟悉度到最低三档', () => {
    // 单独钉住它：displayTier 冷启动只是它的一层壳，壳对了不保证被壳调用的映射本身对。
    expect(familiarityTier(1)).toBe(1)
    expect(familiarityTier(2)).toBe(2)
    expect(familiarityTier(3)).toBe(3)
  })
})

describe('defaultRatingFor', () => {
  it('未首评时按熟悉度给 1 / 2 / 3', () => {
    expect(defaultRatingFor({ stability: null, initialFamiliarity: 1 })).toBe(1)
    expect(defaultRatingFor({ stability: null, initialFamiliarity: 2 })).toBe(2)
    expect(defaultRatingFor({ stability: null, initialFamiliarity: 3 })).toBe(3)
  })

  it('已首评（stability 非空）不预填', () => {
    expect(defaultRatingFor({ stability: 0.5, initialFamiliarity: 3 })).toBeNull()
    expect(defaultRatingFor({ stability: 42, initialFamiliarity: 1 })).toBeNull()
  })

  it('判据是 stability 而不是 reps', () => {
    // assembleCardDTO 的 sched.reps 是硬编码 0，拿它判「是否新卡」会把所有卡都判成新卡。
    expect(defaultRatingFor({ stability: 0.1, initialFamiliarity: 2 })).toBeNull()
  })
})
