import { describe, it, expect } from 'vitest'
import { MASTERY_COLORS, masteryBlocks } from './masteryScale'

describe('masteryScale', () => {
  it('色板 6 项，索引即档位', () => {
    expect(MASTERY_COLORS.length).toBe(6)
    expect(new Set(MASTERY_COLORS).size).toBe(6)
  })

  it('底格能读成「空格」——档 0 用中性色，不是品牌色', () => {
    // 五格的底色画的是「没填的那几格」，若它等于某一档的填色，空档与满格会长得一样。
    expect(MASTERY_COLORS[0]).not.toBe(MASTERY_COLORS[5])
  })

  it('格子总数恒为 5，filled 随档位 0→5 增长', () => {
    expect(masteryBlocks(0)).toEqual({ filled: 0, total: 5 })
    expect(masteryBlocks(3).filled).toBe(3)
    expect(masteryBlocks(5)).toEqual({ filled: 5, total: 5 })
  })
})
