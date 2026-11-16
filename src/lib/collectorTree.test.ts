import { describe, it, expect } from 'vitest'
import { definitionGroups, leafKeys, collectorMergeInputs } from './collectorTree'
import { selectionState } from './dictPlan'
import type { DictionaryField } from '../types/dictionary'

const pos = (value: string, children: DictionaryField[] = []): DictionaryField =>
  ({ key: 'part_of_speech', value, children })
const zh = (value: string): DictionaryField => ({ key: 'chinese_definition', value })
const en = (value: string): DictionaryField => ({ key: 'english_definition', value })
const example = (value: string): DictionaryField => ({ key: 'example', value })

describe('definitionGroups', () => {
  it('groups_only_pos_and_definitions', () => {
    const g = definitionGroups([pos('adj.', [zh('短暂的'), en('short-lived'), example('...')]), pos('n.', [zh('短命的事物')])])
    expect(g.map(x => x.pos)).toEqual(['adj.', 'n.'])
    expect(g[0].leaves.map(l => l.label)).toEqual(['中文释义', '英文释义'])
  })

  it('leaves_are_ordered_cn_before_en_with_per_group_numbers', () => {
    // 组内先中文后英文，义号在组内按该顺序连续计数（与 v0.7.4 返回页的单一序号口径一致）。
    const g = definitionGroups([pos('n.', [en('first'), zh('甲'), en('second'), zh('乙')])])
    expect(g[0].leaves.map(l => [l.key, l.label, l.number, l.value])).toEqual([
      ['0-0', '中文释义', 1, '甲'],
      ['0-1', '中文释义', 2, '乙'],
      ['0-2', '英文释义', 3, 'first'],
      ['0-3', '英文释义', 4, 'second'],
    ])
    // 每个组各自从头计数（不是全树连续）。
    const two = definitionGroups([pos('adj.', [zh('a'), en('b')]), pos('n.', [zh('c')])])
    expect(two.map(x => x.leaves.map(l => l.number))).toEqual([[1, 2], [1]])
  })

  it('leafKeys_lists_every_leaf_in_tree_order', () => {
    const groups = definitionGroups([pos('adj.', [zh('a'), en('b')]), pos('n.', [zh('c')])])
    expect(leafKeys(groups)).toEqual(['0-0', '0-1', '1-0'])
  })

  it('ignores_non_pos_roots_and_nested_definition_children', () => {
    const fields: DictionaryField[] = [
      { key: 'phonetic', value: '/x/' },
      pos('adj.', [{ ...zh('短暂的'), children: [{ key: 'synonyms', value: '' }] }]),
      { key: 'exchange', value: '', children: [{ key: 'exchange_item', value: 'x' }] },
    ]
    const g = definitionGroups(fields)
    expect(g).toHaveLength(1)
    expect(g[0].key).toBe('0')
    expect(g[0].leaves.map(l => l.key)).toEqual(['0-0'])
    // 过滤树剥掉释义自身的子级：近义词不会跟着被合并。
    expect(g[0].leaves[0].field.children).toBeUndefined()
  })
})

describe('selectionState (existing dict-plan helper, same key scheme)', () => {
  it('selection_is_tri_state_over_leaves', () => {
    const keys = ['0-0', '0-1']
    expect(selectionState(new Set(keys), keys, '0')).toBe('all')
    expect(selectionState(new Set(['0-0']), keys, '0')).toBe('partial')
    expect(selectionState(new Set(), keys, '0')).toBe('none')
  })
})

describe('collectorMergeInputs', () => {
  it('example_attaches_under_selected_definition', () => {
    const fields = [pos('adj.', [zh('短暂的'), en('short-lived')])]
    const inputs = collectorMergeInputs(fields, new Set(['0-0']), { text: 'The ephemeral beauty fades.', leafKey: '0-0' })
    const def = inputs.find(i => i.key === 'chinese_definition')
    const container = inputs.find(i => i.key === 'example_sentence')
    const ex = inputs.find(i => i.key === 'example')
    expect(container?.parentTempId).toBe(def?.tempId)
    expect(ex?.parentTempId).toBe(container?.tempId)
    expect(ex?.value).toBe('The ephemeral beauty fades.')
  })

  it('only_selected_definitions_are_merged', () => {
    const fields = [pos('adj.', [zh('短暂的'), en('short-lived')])]
    const inputs = collectorMergeInputs(fields, new Set(['0-1']))
    expect(inputs.map(i => i.key)).toEqual(['part_of_speech', 'english_definition'])
    expect(inputs.map(i => i.tempId)).toEqual(['user:0', 'user:0-1'])
  })

  it('attach_forces_its_leaf_into_the_merge_even_when_unselected', () => {
    // 句子模式的兜底：例句挂靠的释义必须在本次合并里，否则 parentTempId 悬空。
    const fields = [pos('adj.', [zh('短暂的'), en('short-lived')])]
    const inputs = collectorMergeInputs(fields, new Set(), { text: 'A sentence.', leafKey: '0-1' })
    const def = inputs.find(i => i.key === 'english_definition')
    expect(def?.tempId).toBe('user:0-1')
    expect(inputs.find(i => i.key === 'example_sentence')?.parentTempId).toBe('user:0-1')
  })

  it('tempIds_follow_the_source_of_the_definition', () => {
    const fields: DictionaryField[] = [
      { key: 'part_of_speech', value: 'adj.', source: 'ecdict', children: [
        { key: 'chinese_definition', value: '短暂的', source: 'ecdict' },
      ] },
    ]
    const inputs = collectorMergeInputs(fields, new Set(['0-0']), { text: 'x', leafKey: '0-0' })
    expect(inputs.find(i => i.key === 'part_of_speech')?.tempId).toBe('ecdict:0')
    expect(inputs.find(i => i.key === 'chinese_definition')?.tempId).toBe('ecdict:0-0')
    expect(inputs.find(i => i.key === 'example_sentence')?.parentTempId).toBe('ecdict:0-0')
  })

  it('no_attach_leaves_no_example_inputs', () => {
    const fields = [pos('adj.', [zh('短暂的')])]
    const inputs = collectorMergeInputs(fields, new Set(['0-0']))
    expect(inputs.map(i => i.key)).toEqual(['part_of_speech', 'chinese_definition'])
  })
})
