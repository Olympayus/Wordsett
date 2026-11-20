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
  it('恰好 60pt 触发（阈值含）', () => {
    expect(shouldTriggerEdgeBack({ x: 10, y: 300 }, { x: 70, y: 300 })).toBe(true)
  })
  it('起点恰在左缘判定带边界（x=20）触发', () => {
    expect(shouldTriggerEdgeBack({ x: 20, y: 300 }, { x: 80, y: 300 })).toBe(true)
  })
  it('opts 可覆盖 minDistance', () => {
    // dx = 80，默认 60 会触发；把阈值提到 100 后不触发。
    expect(shouldTriggerEdgeBack({ x: 10, y: 300 }, { x: 90, y: 300 }, { minDistance: 100 })).toBe(false)
  })
})
