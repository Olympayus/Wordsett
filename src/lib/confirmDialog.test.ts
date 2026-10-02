import { describe, it, expect } from 'vitest'
import { scrimDismisses } from './confirmDialog'

describe('scrimDismisses', () => {
  it('缺省（undefined）可关闭——既有调用点行为不变', () => {
    expect(scrimDismisses(undefined)).toBe(true)
  })
  it('显式 true 可关闭', () => {
    expect(scrimDismisses(true)).toBe(true)
  })
  it('显式 false 禁用——首次关窗弹窗靠它挡住误点退出', () => {
    expect(scrimDismisses(false)).toBe(false)
  })
})
