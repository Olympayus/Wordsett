import { describe, it, expect } from 'vitest'
import { FIELD_TREE, getAncestors, isFieldVisible, isAncestorOff } from './fieldTree'

const ALL_ON = {
  phonetic: true, part_of_speech: true, chinese_definition: true,
  english_definition: true, example: true, synonyms: true, exchange: true,
  derivatives: true,
} as const

describe('getAncestors', () => {
  it('返回含自身的祖先链', () => {
    expect(getAncestors('example')).toEqual(['part_of_speech', 'english_definition', 'example'])
    expect(getAncestors('derivatives')).toEqual(['derivatives'])
  })
  it('音标不在词典返回树内（卡内已被硬编码隐藏，开关无效），但仍是合法的 DisplayFieldKey', () => {
    // getAncestors 对树外 key 回落到 [key]，不抛错：音标作为 FieldKey 在解析/DB/工作台仍在用
    expect(getAncestors('phonetic')).toEqual(['phonetic'])
    expect(FIELD_TREE.map(n => n.key)).not.toContain('phonetic')
  })
})

describe('FIELD_TREE', () => {
  it('顶级包含「词源相关词」节点（派生词改名后的显示名）', () => {
    const keys = FIELD_TREE.map(n => n.key)
    expect(keys).toContain('derivatives')
    expect(FIELD_TREE.find(n => n.key === 'derivatives')?.label).toBe('词源相关词')
    expect(FIELD_TREE.find(n => n.key === 'derivatives')?.children ?? []).toHaveLength(0)
  })
  it('不再含「音标」节点：词典卡内音标被无条件过滤，该开关控制不了任何东西', () => {
    expect(FIELD_TREE.map(n => n.key)).not.toContain('phonetic')
  })
})

describe('isFieldVisible 级联', () => {
  it('全开时全部可见', () => {
    expect(isFieldVisible('example', ALL_ON)).toBe(true)
    expect(isFieldVisible('phonetic', ALL_ON)).toBe(true)
  })
  it('英文释义关 → 例句/近义词有效关闭，中文释义不受影响', () => {
    const f = { ...ALL_ON, english_definition: false }
    expect(isFieldVisible('example', f)).toBe(false)
    expect(isFieldVisible('synonyms', f)).toBe(false)
    expect(isFieldVisible('chinese_definition', f)).toBe(true)
  })
  it('词性关 → 全部释义关闭，音标不受影响', () => {
    const f = { ...ALL_ON, part_of_speech: false }
    expect(isFieldVisible('chinese_definition', f)).toBe(false)
    expect(isFieldVisible('english_definition', f)).toBe(false)
    expect(isFieldVisible('phonetic', f)).toBe(true)
  })
})

describe('isAncestorOff 祖先关闭判定', () => {
  it('全开 → 所有节点 ancestorOff 为 false', () => {
    expect(isAncestorOff('phonetic', ALL_ON)).toBe(false)
    expect(isAncestorOff('part_of_speech', ALL_ON)).toBe(false)
    expect(isAncestorOff('chinese_definition', ALL_ON)).toBe(false)
    expect(isAncestorOff('english_definition', ALL_ON)).toBe(false)
    expect(isAncestorOff('example', ALL_ON)).toBe(false)
    expect(isAncestorOff('synonyms', ALL_ON)).toBe(false)
    expect(isAncestorOff('exchange', ALL_ON)).toBe(false)
    expect(isAncestorOff('derivatives', ALL_ON)).toBe(false)
  })
  it('english_definition 关 → example/synonyms 为 true（祖先关）；chinese_definition 为 false（兄弟不受影响）', () => {
    const f = { ...ALL_ON, english_definition: false }
    expect(isAncestorOff('example', f)).toBe(true)
    expect(isAncestorOff('synonyms', f)).toBe(true)
    expect(isAncestorOff('chinese_definition', f)).toBe(false)
  })
  it('english_definition 自身关 → 其 own isAncestorOff 为 false（关键回归：自身关闭不禁止自身开关）', () => {
    const f = { ...ALL_ON, english_definition: false }
    expect(isAncestorOff('english_definition', f)).toBe(false)
  })
  it('example 自身关 → 其 own isAncestorOff 为 false（例句开关可重新开启）', () => {
    const f = { ...ALL_ON, example: false }
    expect(isAncestorOff('example', f)).toBe(false)
  })
  it('phonetic 关 → 自身 false（根节点无祖先）', () => {
    const f = { ...ALL_ON, phonetic: false }
    expect(isAncestorOff('phonetic', f)).toBe(false)
  })
})
