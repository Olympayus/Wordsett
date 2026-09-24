import { describe, it, expect } from 'vitest'
import { mastery, retrievability, elapsedDaysSince, masteryTier, NEW_CARD_RNOW } from './mastery'

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

  it('masteryTier 分五档，无记录为 0，最高不超过 4', () => {
    expect(masteryTier(null)).toBe(0)
    expect(masteryTier(0.2)).toBe(1)
    expect(masteryTier(0.5)).toBe(2)
    expect(masteryTier(0.7)).toBe(3)
    expect(masteryTier(0.95)).toBe(4)
    expect(masteryTier(1)).toBe(4)      // 上界不得溢出到 5
    expect(masteryTier(0)).toBe(1)
  })
})
