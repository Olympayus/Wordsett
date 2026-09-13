import { describe, it, expect } from 'vitest'
import { tooltipPosition, clampTooltipY } from './tooltipPosition'

describe('tooltipPosition', () => {
  it('常规位置：图标右侧打开', () => {
    const p = tooltipPosition({ left: 300, right: 316, top: 100 }, 320, 8, 1200)
    expect(p.x).toBe(324)
    expect(p.y).toBe(100)
  })
  it('右缘溢出且左侧可开：翻到左侧', () => {
    const p = tooltipPosition({ left: 900, right: 916, top: 100 }, 320, 8, 1200)
    expect(p.x).toBe(572)
  })
  it('y 钳制不小于 4', () => {
    const p = tooltipPosition({ left: 100, right: 116, top: 1 }, 320, 8, 1200)
    expect(p.y).toBe(4)
  })
})

// 纵向：tooltipPosition 只给起点 y，面板高度要渲染后才量得到，故单独一步修正。
describe('clampTooltipY 纵向收纳（面板不得超出视口）', () => {
  it('下方放得下 → 原地不动', () => {
    expect(clampTooltipY(100, 100, 200, 900, 8)).toBe(100)
  })

  it('刚好贴底（y + h + gap === vh）→ 仍未溢出，不动', () => {
    expect(clampTooltipY(100, 100, 792, 900, 8)).toBe(100)
  })

  it('下方放不下但上方放得下 → 翻到图标上方', () => {
    // 800 + 300 + 8 > 900，上翻到 800 − 8 − 300 = 492
    expect(clampTooltipY(800, 800, 300, 900, 8)).toBe(492)
  })

  it('上下都放不下 → 贴视口底部，不越出下缘', () => {
    // 上翻得 400 − 8 − 850 < 8，故夹到 900 − 8 − 850 = 42
    expect(clampTooltipY(400, 400, 850, 900, 8)).toBe(42)
  })

  it('面板比视口还高 → 至少留在顶部 8px（不返回负数）', () => {
    expect(clampTooltipY(20, 20, 1000, 900, 8)).toBe(8)
  })
})
