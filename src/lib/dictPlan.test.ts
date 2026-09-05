import { describe, it, expect } from 'vitest'
import { mergeEntryFields, flattenTree, buildMergeInputs, toggleSubtreeSelection, shouldNumberField, shouldFlattenChildren, countZhEn, countAllDefinitions } from './dictPlan'
import type { DictionaryField } from '../types/dictionary'

const fields: DictionaryField[] = [
  { key: 'part_of_speech', value: 'n.', children: [
    { key: 'chinese_definition', value: '大气' },
    { key: 'english_definition', value: 'the atmosphere', children: [
      { key: 'synonyms', value: '', children: [{ key: 'synonym_item', value: 'air' }] },
    ] },
  ] },
  { key: 'exchange', value: '', children: [{ key: 'exchange_item', value: '过去式: observed' }] },
]

describe('mergeEntryFields', () => {
  it('同词性父按标签合并', () => {
    const merged = mergeEntryFields([
      { key: 'part_of_speech', value: 'n.', children: [{ key: 'chinese_definition', value: '大气' }] },
      { key: 'part_of_speech', value: 'n.', children: [{ key: 'english_definition', value: 'the atmosphere' }] },
      { key: 'part_of_speech', value: 'v.', children: [{ key: 'chinese_definition', value: '觉察' }] },
    ])
    const pos = merged.filter(f => f.key === 'part_of_speech')
    expect(pos).toHaveLength(2)
    expect(pos[0].children!.map(c => c.key)).toEqual(['chinese_definition', 'english_definition'])
  })
})

describe('flattenTree', () => {
  it('分配稳定路径 key 与 parentKey', () => {
    const flat = flattenTree(fields)
    expect(flat[0].key).toBe('0')
    expect(flat[0].children[0].key).toBe('0-0')
    expect(flat[0].children[1].children[0].key).toBe('0-1-0')
    expect(flat[0].children[1].parentKey).toBe('0')
  })
})

describe('buildMergeInputs', () => {
  it('父先子后，子引用父 tempId', () => {
    const sel = new Set(['0', '0-1', '0-1-0'])
    const inputs = buildMergeInputs(fields, sel, 'ecdict')
    expect(inputs.map(i => i.key)).toEqual(['part_of_speech', 'english_definition', 'synonyms'])
    expect(inputs[1].tempId).toBe('ecdict:0-1')
    expect(inputs[2].parentTempId).toBe('ecdict:0-1')
  })
  it('勾选子但漏勾父：自动隐式补选祖先（保证无游离释义）', () => {
    const inputs = buildMergeInputs(fields, new Set(['0-1-0']), 'wordnet')
    expect(inputs.map(i => i.key)).toEqual(['part_of_speech', 'english_definition', 'synonyms'])
  })
})

describe('shouldNumberField', () => {
  it('仅中/英释义带编号；近义词/例句等不编号', () => {
    expect(shouldNumberField('chinese_definition')).toBe(true)
    expect(shouldNumberField('english_definition')).toBe(true)
    expect(shouldNumberField('synonyms')).toBe(false)
    expect(shouldNumberField('example_sentence')).toBe(false)
    expect(shouldNumberField('phonetic')).toBe(false)
    expect(shouldNumberField('exchange')).toBe(false)
    expect(shouldNumberField('part_of_speech')).toBe(false)
  })
})

describe('shouldFlattenChildren', () => {
  const leaf = (key: string) => ({ key, value: 'x' })
  const nested = (key: string) => ({ key, value: '', children: [{ key: 'item', value: 'y' }] })

  it('词性窗格永不平铺（保留词性→释义树与中/英释义编号）', () => {
    expect(shouldFlattenChildren(true, true, [leaf('chinese_definition'), leaf('english_definition')])).toBe(false)
  })
  it('非词性容器且子项全为终端项时平铺', () => {
    expect(shouldFlattenChildren(false, true, [leaf('example'), leaf('example')])).toBe(true)
  })
  it('子项含子级时不平铺（保留树状）', () => {
    expect(shouldFlattenChildren(false, true, [nested('synonyms')])).toBe(false)
  })
  it('无子级时不平铺', () => {
    expect(shouldFlattenChildren(false, false, [])).toBe(false)
  })
})

describe('toggleSubtreeSelection', () => {
  const allKeys = ['0', '0-0', '0-1', '0-1-0', '1', '1-0']

  it('全选时点击 → 清空该子树（key + 全部后代移除，兄弟/外部 key 保留）', () => {
    const all = new Set(allKeys)
    const next = toggleSubtreeSelection(all, allKeys, '0')
    expect([...next].sort()).toEqual(['1', '1-0'])
  })

  it('未选时点击 → 补全 key + 全部后代', () => {
    const partial = new Set(['1', '1-0'])
    const next = toggleSubtreeSelection(partial, allKeys, '0')
    expect([...next].sort()).toEqual([...allKeys].sort())
  })

  it('前缀安全：key 0-1 不得误匹配兄弟 0-10', () => {
    const keys = ['0', '0-1', '0-10', '0-1-0']
    const all = new Set(keys)
    const next = toggleSubtreeSelection(all, keys, '0-1')
    // 0-1 子树 = {0-1, 0-1-0} 被清空；兄弟 0-10 保留
    expect([...next].sort()).toEqual(['0', '0-10'])
  })
})

describe('countZhEn / countAllDefinitions', () => {
  it('词性节点：只数直属中/英释义', () => {
    const node = { key: '0', parentKey: null, field: { key: 'part_of_speech', value: 'n.' },
      children: [
        { key: '0-0', parentKey: '0', field: { key: 'chinese_definition', value: '苹果' }, children: [] },
        { key: '0-1', parentKey: '0', field: { key: 'chinese_definition', value: '苹果树' }, children: [] },
        { key: '0-2', parentKey: '0', field: { key: 'english_definition', value: 'apple' }, children: [] },
        { key: '0-3', parentKey: '0', field: { key: 'example_sentence', value: '' }, children: [] },
      ] } as any
    expect(countZhEn(node)).toEqual({ cn: 2, en: 1 })
  })
  it('countAllDefinitions 全树累计中+英', () => {
    const fields = [
      { key: 'part_of_speech', value: 'n.', children: [
        { key: 'chinese_definition', value: 'a' }, { key: 'english_definition', value: 'b' } ] },
      { key: 'part_of_speech', value: 'v.', children: [
        { key: 'chinese_definition', value: 'c' }, { key: 'chinese_definition', value: 'd' } ] },
      { key: 'exchange', value: '', children: [{ key: 'exchange_item', value: 'p:ran' }] },
    ] as any
    expect(countAllDefinitions(fields)).toEqual({ cn: 3, en: 1 })
  })
})
