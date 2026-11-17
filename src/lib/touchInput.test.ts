import { describe, it, expect } from 'vitest'
import { touchInputStyles } from './touchInput'

describe('touchInputStyles（v0.7.10 触摸输入档）', () => {
  it('touchInputStyles_only_on_touch', () => {
    expect(touchInputStyles(false)).toEqual({})
    expect(touchInputStyles(true).fontSize).toBe(16)
    expect(touchInputStyles(true).minHeight).toBe(40)
  })
})
