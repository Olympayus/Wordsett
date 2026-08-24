import { describe, it, expect } from 'vitest'
import { isWordCollected } from './collected'

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