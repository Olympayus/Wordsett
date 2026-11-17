import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasCoarsePointer } from './pointer'

// 单测环境（node）没有 window.matchMedia，用 stubGlobal 造出两种指针类型。
afterEach(() => { vi.unstubAllGlobals() })

describe('hasCoarsePointer（v0.7.10）', () => {
  it('无 matchMedia（SSR / 测试环境）→ false，退回桌面语义', () => {
    expect(hasCoarsePointer()).toBe(false)
  })

  it('主指针为触摸 → true', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    expect(hasCoarsePointer()).toBe(true)
  })

  it('主指针为鼠标 → false', () => {
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({ matches: query === '(pointer: coarse)' ? false : true }),
    })
    expect(hasCoarsePointer()).toBe(false)
  })
})
