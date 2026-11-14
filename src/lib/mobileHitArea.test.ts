import { describe, it, expect } from 'vitest'
import {
  exceedsSlop,
  hitAreaStyle,
  TOUCH_LONG_PRESS_MS,
  TOUCH_SLOP_PX,
  TOUCH_TARGET_PX,
} from './mobileHitArea'

describe('touch constants', () => {
  it('按设计取值：长按 250ms / 滑动 8px / 命中区 44px', () => {
    expect(TOUCH_LONG_PRESS_MS).toBe(250)
    expect(TOUCH_SLOP_PX).toBe(8)
    expect(TOUCH_TARGET_PX).toBe(44)
  })
})

describe('exceedsSlop', () => {
  it('8px 以内不算滑动', () => {
    expect(exceedsSlop(8, 0)).toBe(false)
    expect(exceedsSlop(0, -8)).toBe(false)
    expect(exceedsSlop(5, 5)).toBe(false)
  })
  it('超过 8px（勾股）算滑动', () => {
    expect(exceedsSlop(9, 0)).toBe(true)
    expect(exceedsSlop(6, 6)).toBe(true)
  })
})

describe('hitAreaStyle', () => {
  it('默认是 44×44 绝对定位覆盖层', () => {
    const s = hitAreaStyle()
    expect(s.position).toBe('absolute')
    expect(s.height).toBe(`${TOUCH_TARGET_PX}px`)
    expect(s.width).toBe(`${TOUCH_TARGET_PX}px`)
    expect(s.pointerEvents).toBe('auto')
  })
  it('verticalOnly 只纵向扩：宽 auto、左右贴边', () => {
    const s = hitAreaStyle({ verticalOnly: true })
    expect(s.width).toBe('auto')
    expect(s.left).toBe(0)
    expect(s.right).toBe(0)
  })
  it('永不使用 margin / padding 扩张（那会进布局）', () => {
    const s = hitAreaStyle()
    expect(s.margin).toBeUndefined()
    expect(s.padding).toBeUndefined()
  })
})
