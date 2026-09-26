import { describe, it, expect } from 'vitest'
import { BUTTON_TONES, buttonBackground } from './SquareButton'

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

// 下面这组走 buttonBackground 而非直接读常量：常量对了但接线错了（把 tone 分支删掉、
// 或把某套的 rest 与 hover 对调）时，只有经由这个函数的断言会红。
describe('buttonBackground：哪套底色 × 哪个态', () => {
  const at = (tone: 'canvas' | 'surface', hover: boolean) => buttonBackground({ hover, tone })

  it('常态下两套取各自的 rest，且两套不同', () => {
    expect(at('canvas', false)).toBe(BUTTON_TONES.canvas.rest)
    expect(at('surface', false)).toBe(BUTTON_TONES.surface.rest)
    // 白底套比画布套浅——这正是这一项存在的理由，改接线时最容易把它改没
    expect(at('surface', false)).not.toBe(at('canvas', false))
  })

  it('hover 压过常态 rest，两套都成立', () => {
    for (const tone of ['canvas', 'surface'] as const) {
      expect(at(tone, true)).toBe(BUTTON_TONES[tone].hover)
      expect(at(tone, true)).not.toBe(at(tone, false))
    }
  })

  it('生效态（on）用品牌蓝底，且不随 tone 变浅', () => {
    for (const hover of [false, true]) {
      const canvas = buttonBackground({ on: true, hover, tone: 'canvas' })
      const surface = buttonBackground({ on: true, hover, tone: 'surface' })
      // 两套的生效态是同一个品牌蓝——语义由 role/aria-checked 承载，底色不随容器变
      expect(canvas).toBe(surface)
      expect(canvas).not.toBeNull()
      // 生效态与 hover 正交时走「生效色的亮一阶」，绝不掉回中性底
      expect(canvas).not.toBe(BUTTON_TONES.canvas.rest)
      expect(canvas).not.toBe(BUTTON_TONES.canvas.hover)
      expect(canvas).not.toBe(BUTTON_TONES.surface.rest)
      expect(canvas).not.toBe(BUTTON_TONES.surface.hover)
      // 品牌底是 color-mix 出来的实色，不是中性档的 var() —— 顺带钉住「确实是另一支」
      expect(canvas).toContain('color-mix')
    }
    // hover 打在生效态上要提亮一阶（生效色亮一阶 ≠ 生效色本身）
    expect(buttonBackground({ on: true, hover: true, tone: 'canvas' }))
      .not.toBe(buttonBackground({ on: true, hover: false, tone: 'canvas' }))
  })

  it('disabled 不出底色（回落到 BUTTON_DISABLED，与 v0.6.1 一致）', () => {
    for (const tone of ['canvas', 'surface'] as const) {
      expect(buttonBackground({ disabled: true, hover: false, tone })).toBeNull()
      expect(buttonBackground({ disabled: true, hover: true, tone })).toBeNull()
    }
    // 禁用优先于生效态：on + disabled 也不该冒出品牌底
    expect(buttonBackground({ disabled: true, on: true, hover: true, tone: 'canvas' })).toBeNull()
  })

  it('缺省 tone 等同 canvas（v0.6.1 的现状行为）', () => {
    expect(buttonBackground({ hover: false })).toBe(BUTTON_TONES.canvas.rest)
    expect(buttonBackground({ hover: true })).toBe(BUTTON_TONES.canvas.hover)
  })
})
