import { describe, it, expect } from 'vitest'
import { selectListboxPosition } from './Select'

/**
 * 下拉浮层落点（v0.7.10 Task 18 补测）：坐标是视觉坐标，面板布局尺寸在 zoom 下按
 * `1 / zoom` 放大——视觉宽度才与触发器一致，`maxHeight` 同理换算成布局高度。
 */
describe('selectListboxPosition', () => {
  it('桌面：贴触发器下缘、与触发器同宽', () => {
    const p = selectListboxPosition({ left: 100, right: 340, bottom: 30 }, 1000, 800)
    expect(p).toEqual({ left: 100, top: 34, width: 240, maxHeight: 758 })
  })

  it('zoom：布局宽度按 1/zoom 放大，视觉宽度仍等于触发器', () => {
    const p = selectListboxPosition({ left: 100, right: 340, bottom: 30 }, 1000, 800, 0.85)
    expect(p.width * 0.85).toBeCloseTo(240)
    expect(p.left).toBe(100)
    expect(p.top).toBe(34)
    // 可用高度也要换算回布局高度：视觉上仍是视口底部余量
    expect(p.maxHeight * 0.85).toBeCloseTo(800 - 34 - 8)
  })

  it('窄视口：面板不越出左右边缘', () => {
    const p = selectListboxPosition({ left: 900, right: 1140, bottom: 30 }, 1000, 800)
    expect(p.left).toBe(1000 - 8 - 240)
    expect(p.width).toBe(240)
  })

  it('zoom 省略时与 zoom = 1 逐字一致（桌面不变）', () => {
    const anchor = { left: 100, right: 340, bottom: 30 }
    expect(selectListboxPosition(anchor, 1000, 800))
      .toEqual(selectListboxPosition(anchor, 1000, 800, 1))
  })
})
