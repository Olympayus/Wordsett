import { describe, it, expect } from 'vitest'
import { visibleTabs, defaultTab, missingTabs, groupRootsByTab, addableLeafKeys, TAB_ORDER, TAB_GROUPS, TAB_ITEM_KEYS } from './tabs'
import type { FieldValue } from '../types/field'

// fieldId 直接当作字段 key 注入，keyOf 用 fieldId
const kv = (id: string): FieldValue => ({
  id, wordId: 'w', fieldId: id, value: '', source: 'ecdict', edited: false,
  originalValue: null, displayOrder: 0, parentId: null, createdAt: 0, updatedAt: 0, children: [],
})
const keyOf = (fv: FieldValue) => fv.fieldId

describe('tabs 派生', () => {
  it('只含词性 → 仅主标签页可见，默认主标签页，缺失其余四个', () => {
    const roots = [kv('part_of_speech')]
    expect(visibleTabs(roots, keyOf)).toEqual(['main'])
    expect(defaultTab(roots, keyOf)).toBe('main')
    expect(missingTabs(roots, keyOf)).toEqual(['phrase', 'exchange', 'derivatives', 'discrimination'])
  })

  it('只含短语 → 主标签页不可见，默认第一个可见=短语', () => {
    const roots = [kv('phrase')]
    expect(visibleTabs(roots, keyOf)).toEqual(['phrase'])
    expect(defaultTab(roots, keyOf)).toBe('phrase')
  })

  it('补充存在即可见主标签页（词性+补充任一）', () => {
    const roots = [kv('supplementary')]
    expect(visibleTabs(roots, keyOf)).toEqual(['main'])
    expect(defaultTab(roots, keyOf)).toBe('main')
  })

  it('无任何内容 → 默认 null，缺失全部', () => {
    expect(visibleTabs([], keyOf)).toEqual([])
    expect(defaultTab([], keyOf)).toBeNull()
    expect(missingTabs([], keyOf)).toEqual(TAB_ORDER)
  })

  it('addableLeafKeys：主=根容器，单独标签页=直接项', () => {
    expect(addableLeafKeys('main')).toEqual(['part_of_speech', 'supplementary'])
    expect(addableLeafKeys('phrase')).toEqual(['phrase_item'])
    expect(addableLeafKeys('exchange')).toEqual(['exchange_item'])
    expect(addableLeafKeys('derivatives')).toEqual(['derivatives_item'])
    expect(addableLeafKeys('discrimination')).toEqual(['synonym_discrimination_item'])
  })

  it('groupRootsByTab 正确分组并丢弃未知根字段', () => {
    const roots = [kv('part_of_speech'), kv('phrase'), kv('exchange'), kv('unknown')]
    const g = groupRootsByTab(roots, keyOf)
    expect(g.main).toHaveLength(1)
    expect(g.phrase).toHaveLength(1)
    expect(g.exchange).toHaveLength(1)
    expect(g.derivatives).toHaveLength(0)
    expect(g.discrimination).toHaveLength(0)
  })

  it('discrimination 标签页：位于 TAB_ORDER 末尾，label=近义词辨析，item=近义词辨析项', () => {
    expect(TAB_ORDER[TAB_ORDER.length - 1]).toBe('discrimination')
    expect(TAB_GROUPS.discrimination.label).toBe('近义词辨析')
    expect(TAB_ITEM_KEYS.discrimination).toBe('synonym_discrimination_item')
  })
})
