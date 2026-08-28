import { describe, it, expect } from 'vitest'
import { BUILTIN_FIELDS } from './field'

describe('BUILTIN_FIELDS', () => {
  it('包含 19 个内置字段', () => {
    expect(Object.keys(BUILTIN_FIELDS)).toHaveLength(19)
  })
  it('含 6 个新增字段键', () => {
    for (const k of ['supplementary', 'supplementary_item', 'phrase', 'phrase_item', 'derivatives_item', 'synonym_item']) {
      expect(Object.keys(BUILTIN_FIELDS)).toContain(k)
    }
  })
})
