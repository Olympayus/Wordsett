import { describe, it, expect } from 'vitest'
import { masteryTooltipModel } from '../../lib/review/masteryScale'

describe('masteryTooltipModel（v0.6.5）', () => {
  it('无调度记录时不报百分比——报 0 会被读成「最弱」', () => {
    const m = masteryTooltipModel({ weakestStability: null, familiarity: 2 })
    expect(m.score).toBeNull()
    expect(m.tier).toBe(2)          // 冷启动：回落到收录时自报的熟悉度
    expect(m.tierName).toBe('初识')
  })

  it('有记录时以 FSRS 为准，报到分值、档位名', () => {
    const m = masteryTooltipModel({ weakestStability: 3, familiarity: 3 })
    expect(m.score).toBe(10)
    expect(m.tier).toBe(1)
    expect(m.tierName).toBe('陌生')
  })

  it('分值不为 null 时一定有档位名，不会渲染出 undefined', () => {
    for (const s of [1, 3, 7, 20, 60, 200]) {
      const m = masteryTooltipModel({ weakestStability: s, familiarity: 1 })
      expect(typeof m.tierName).toBe('string')
      expect(m.tierName.length).toBeGreaterThan(0)
    }
  })
})
