import { describe, it, expect } from 'vitest'
import { sourceAccent } from './DictDetailCard'

describe('sourceAccent（v0.6.3 条目 15）', () => {
  it('两种来源都是基础字色，不再是各带一个色相', () => {
    expect(sourceAccent('ecdict')).toBe('var(--color-text-primary)')
    expect(sourceAccent('wordnet')).toBe('var(--color-text-primary)')
  })

  it('未知来源也回落到字色，不抛', () => {
    expect(sourceAccent('whatever')).toBe('var(--color-text-primary)')
  })
})
