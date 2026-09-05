import { describe, it, expect } from 'vitest'
import { countMatches } from './findText'

describe('countMatches', () => {
  it('大小写不敏感字面量计数', () => {
    expect(countMatches('Run ran RUNNING run', 'run')).toBe(3)
    expect(countMatches('苹果 苹果树 苹果', '苹果')).toBe(3)  // 子串连续命中：苹果树 内的 苹果 亦计 1 处
  })
  it('空 query 返回 0', () => { expect(countMatches('abc', '')).toBe(0) })
})
