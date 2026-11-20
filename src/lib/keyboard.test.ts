import { describe, it, expect } from 'vitest'
import { keyboardOverlap, shouldScrollIntoView } from './keyboard'

describe('keyboard（v0.8.0 iOS 键盘遮挡）', () => {
  it('键盘高度按 visualViewport 与布局高之差算', () => {
    expect(keyboardOverlap({ top: 0, bottom: 500, height: 500 }, 800)).toBe(300)
    expect(keyboardOverlap({ top: 0, bottom: 800, height: 800 }, 800)).toBe(0)
  })
  it('元素在可视区内不滚', () => {
    expect(shouldScrollIntoView({ top: 100, bottom: 200, height: 100 }, { top: 0, bottom: 500, height: 500 })).toBe(false)
  })
  it('元素被键盘压住要滚', () => {
    expect(shouldScrollIntoView({ top: 450, bottom: 550, height: 100 }, { top: 0, bottom: 500, height: 500 })).toBe(true)
  })
})
