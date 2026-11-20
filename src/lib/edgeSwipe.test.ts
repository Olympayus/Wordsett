import { describe, it, expect } from 'vitest'
import { shouldTriggerEdgeBack } from './edgeSwipe'

describe('shouldTriggerEdgeBack（v0.8.0 iOS 左缘右滑返回）', () => {
  it('左缘水平右滑 60pt 触发', () => {
    expect(shouldTriggerEdgeBack({ x: 10, y: 300 }, { x: 80, y: 305 })).toBe(true)
  })
  it('非左缘起点不触发', () => {
    expect(shouldTriggerEdgeBack({ x: 30, y: 300 }, { x: 100, y: 300 })).toBe(false)
  })
  it('位移不足不触发', () => {
    expect(shouldTriggerEdgeBack({ x: 10, y: 300 }, { x: 60, y: 300 })).toBe(false)
  })
  it('竖向为主不触发（滚动）', () => {
    expect(shouldTriggerEdgeBack({ x: 10, y: 300 }, { x: 70, y: 390 })).toBe(false)
  })
  it('向左滑不触发', () => {
    expect(shouldTriggerEdgeBack({ x: 10, y: 300 }, { x: -20, y: 300 })).toBe(false)
  })
})
