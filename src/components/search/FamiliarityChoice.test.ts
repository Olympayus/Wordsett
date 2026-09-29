import { describe, it, expect } from 'vitest'
import { FAMILIARITY_OPTIONS } from './FamiliarityChoice'

describe('FamiliarityChoice 文案（v0.6.5 §4.5）', () => {
  it('三档枚举值与顺序不变', () => {
    expect(FAMILIARITY_OPTIONS.map(o => o.value)).toEqual([1, 2, 3])
  })

  it('第一档改名为「陌生」——不再叫「完全陌生」', () => {
    expect(FAMILIARITY_OPTIONS[0].label).toBe('陌生')
  })

  it('另两档不动', () => {
    expect(FAMILIARITY_OPTIONS.map(o => o.label)).toEqual(['陌生', '眼熟', '认识'])
  })
})
