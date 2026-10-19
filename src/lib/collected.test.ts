import { describe, it, expect } from 'vitest'
import { isWordCollected, libraryLocationOf } from './collected'

describe('isWordCollected', () => {
  const collected = [
    { normalizedLemma: 'interesting' },
    { normalizedLemma: 'apple' },
  ]
  it('normalizedLemma 精确命中 → true', () => {
    expect(isWordCollected('interesting', collected)).toBe(true)
  })
  it('大小写/首尾空白归一化后命中 → true', () => {
    expect(isWordCollected('  Apple ', collected)).toBe(true)
  })
  it('不在词库 → false', () => {
    expect(isWordCollected('banana', collected)).toBe(false)
  })
  it('空串/纯空白 → false', () => {
    expect(isWordCollected('', collected)).toBe(false)
    expect(isWordCollected('   ', collected)).toBe(false)
  })
})

describe('libraryLocationOf（纯函数，v0.7.5 Task 9）', () => {
  const ws = [{ normalizedLemma: 'abandon', location: 'workspace' as const }]
  const ar = [{ normalizedLemma: 'forsake', location: 'archive' as const }]

  it('已收录判定区分工作台与储藏库', () => {
    expect(libraryLocationOf('abandon', [...ws, ...ar])).toBe('workspace')
    expect(libraryLocationOf('FORSAKE', [...ws, ...ar])).toBe('archive')
    expect(libraryLocationOf('unknown', [...ws, ...ar])).toBeNull()
  })

  it('入参大小写/首尾空白归一化后命中；空串回落 null', () => {
    expect(libraryLocationOf('  Abandon ', [...ws, ...ar])).toBe('workspace')
    expect(libraryLocationOf('', [...ws, ...ar])).toBeNull()
    expect(libraryLocationOf('   ', [...ws, ...ar])).toBeNull()
  })
})
