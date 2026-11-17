import { describe, it, expect } from 'vitest'
import { clampMenuPosition } from './menuPosition'

describe('clampMenuPosition', () => {
  it('中间位置保持原坐标', () => {
    expect(clampMenuPosition(100, 100, 168, 100, 800, 600)).toEqual({ x: 100, y: 100 })
  })
  it('右/下越界时钳制在视口内', () => {
    const p = clampMenuPosition(700, 560, 168, 100, 800, 600)
    expect(p.x).toBeLessThanOrEqual(800 - 168 - 4)
    expect(p.y).toBeLessThanOrEqual(600 - 100 - 4)
  })
  it('不越界时不上提', () => {
    expect(clampMenuPosition(50, 50, 168, 100, 800, 600)).toEqual({ x: 50, y: 50 })
  })
})

// 平板 zoom（v0.7.10 Task 18）：位置是视觉坐标，面板尺寸按 zoom 缩放后才参与钳制。
describe('clampMenuPosition zoom', () => {
  it('按缩放后的视觉尺寸钳制（面板变小，能更靠近右缘）', () => {
    const p = clampMenuPosition(700, 100, 168, 100, 800, 600, 0.85)
    expect(p.x).toBeCloseTo(800 - 168 * 0.85 - 4)
    expect(p.y).toBe(100)
  })
  it('省略 zoom 与显式 zoom = 1 逐字一致（桌面不变）', () => {
    expect(clampMenuPosition(700, 560, 168, 100, 800, 600))
      .toEqual(clampMenuPosition(700, 560, 168, 100, 800, 600, 1))
  })
})
