import { describe, it, expect } from 'vitest'
import { mobileRowActionsVisible } from './mobileRowActions'

describe('mobileRowActionsVisible', () => {
  it('只有顶层且有子项的行保留 ⋯', () => {
    expect(mobileRowActionsVisible(0, true)).toBe(true)
  })
  it('顶层叶子行不留（走长按）', () => {
    expect(mobileRowActionsVisible(0, false)).toBe(false)
  })
  it('嵌套行一律不留（含嵌套容器）', () => {
    expect(mobileRowActionsVisible(1, true)).toBe(false)
    expect(mobileRowActionsVisible(2, false)).toBe(false)
  })
})
