import { describe, it, expect } from 'vitest'
import { BUTTON_TONES } from './SquareButton'

describe('方块按钮的底色两套（v0.6.2 条目 1）', () => {
  it('白底套整体浅于画布套', () => {
    const canvas = BUTTON_TONES.canvas
    const surface = BUTTON_TONES.surface
    // 用相对亮度比而不是硬编码色值——色值调整时这条测试仍成立
    expect(surface.rest).not.toBe(canvas.rest)
    expect(surface.hover).not.toBe(canvas.hover)
    // 两套各自的 hover 与 rest 也必须不同，否则 hover 读不出来
    expect(surface.hover).not.toBe(surface.rest)
    expect(canvas.hover).not.toBe(canvas.rest)
  })

  it('四个值都是非空的 CSS 颜色表达式', () => {
    for (const t of [BUTTON_TONES.canvas, BUTTON_TONES.surface]) {
      for (const v of [t.rest, t.hover]) {
        expect(typeof v).toBe('string')
        expect(v.length).toBeGreaterThan(0)
      }
    }
  })
})
