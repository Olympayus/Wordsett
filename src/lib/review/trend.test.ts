import { describe, it, expect } from 'vitest'
import { dayTotal, dayAccuracy, isTrendSparse, type DayRating } from './trend'

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
