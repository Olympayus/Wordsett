import { describe, it, expect } from 'vitest'
import { placeTooltip } from './tooltipPosition'

// 面板尺寸与触发器矩形都是视觉坐标（getBoundingClientRect 的产出），下同。
describe('placeTooltip auto：右侧 → 左侧 → 下方 → 上方', () => {
  it('右侧放得下：贴在右缘，纵向居中于触发器', () => {
    const p = placeTooltip({ left: 300, right: 316, top: 100, bottom: 130 }, { width: 320, height: 40 }, 'auto', 1200, 900, 8)
    expect(p).toEqual({ x: 324, y: 95 })
  })

  it('右缘溢出且左侧可开：翻到左侧', () => {
    const p = placeTooltip({ left: 900, right: 916, top: 100, bottom: 130 }, { width: 320, height: 40 }, 'auto', 1200, 900, 8)
    expect(p.x).toBe(572)
    expect(p.y).toBe(95)
  })

  it('两侧都放不下：改到下方，横向居中并推回视口内', () => {
    // 右 28 + 50 > 76；左 10 − 8 − 50 < 4；下方 130 + 8 + 40 = 178 放得下。
    // 横向居中后左缘为 −10，钳到 4。
    const p = placeTooltip({ left: 10, right: 20, top: 100, bottom: 130 }, { width: 50, height: 40 }, 'auto', 80, 900, 8)
    expect(p).toEqual({ x: 4, y: 138 })
  })

  it('下方也放不下：翻到上方', () => {
    const p = placeTooltip({ left: 10, right: 20, top: 850, bottom: 880 }, { width: 50, height: 30 }, 'auto', 80, 900, 8)
    expect(p).toEqual({ x: 4, y: 812 })
  })

  it('贴底时纵向钳回视口（右侧仍放得下）', () => {
    const p = placeTooltip({ left: 10, right: 26, top: 880, bottom: 912 }, { width: 100, height: 40 }, 'auto', 1200, 900, 8)
    expect(p).toEqual({ x: 34, y: 856 })
  })

  it('面板比视口还宽：宁可压住锚点也不越出窗口', () => {
    const p = placeTooltip({ left: 100, right: 116, top: 100, bottom: 130 }, { width: 2000, height: 40 }, 'auto', 1200, 900, 8)
    expect(p.x).toBe(4)
    expect(p.y).toBe(138)
  })
})

describe('placeTooltip 显式方向（顶部窗口控制键用 below）', () => {
  it('below：即使右侧放得下也出现在下方，横向居中', () => {
    const p = placeTooltip({ left: 1200, right: 1230, top: 10, bottom: 38 }, { width: 60, height: 30 }, 'below', 1280, 900, 8)
    expect(p).toEqual({ x: 1185, y: 46 })
  })

  it('below：贴右缘时横向钳回视口', () => {
    const p = placeTooltip({ left: 1250, right: 1276, top: 10, bottom: 38 }, { width: 60, height: 30 }, 'below', 1280, 900, 8)
    expect(p).toEqual({ x: 1216, y: 46 })
  })
})
