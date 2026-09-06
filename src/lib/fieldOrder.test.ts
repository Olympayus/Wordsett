import { describe, it, expect } from 'vitest'
import { templateRank, compareSiblings, sortTreeByTemplate, ALLOWED_CHILD_KEYS, ROOT_FIELD_KEYS } from './fieldOrder'
import { BUILTIN_FIELDS } from '../types/field'
import type { FieldValue } from '../types/field'

const fv = (id: string, key: string, displayOrder: number): FieldValue => ({
  id, wordId: 'w', fieldId: `f_${key}`, value: '', source: 'ecdict', edited: false,
  originalValue: null, displayOrder, parentId: null, createdAt: 0, updatedAt: 0,
})
const keyOf = (f: FieldValue) => f.fieldId.replace('f_', '')

describe('templateRank', () => {
  it('根级：音标→词性→补充→短语→词形变化→派生词', () => {
    const order = [templateRank(null, 'phonetic'), templateRank(null, 'part_of_speech'), templateRank(null, 'supplementary'),
      templateRank(null, 'phrase'), templateRank(null, 'exchange'), templateRank(null, 'derivatives')]
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(new Set(order).size).toBe(6)
  })
  it('词性下：中文释义先于英文释义', () => {
    expect(templateRank('part_of_speech', 'chinese_definition')).toBeLessThan(templateRank('part_of_speech', 'english_definition'))
  })
  it('释义下：使用场景→例句→近义词', () => {
    expect(templateRank('chinese_definition', 'usage_scenario')).toBeLessThan(templateRank('chinese_definition', 'example_sentence'))
    expect(templateRank('chinese_definition', 'example_sentence')).toBeLessThan(templateRank('chinese_definition', 'synonyms'))
  })
  it('容器内项顺序排列', () => {
    expect(templateRank('exchange', 'exchange_item')).toBe(0)
    expect(templateRank('supplementary', 'supplementary_item')).toBe(0)
  })
})

describe('compareSiblings', () => {
  it('类型位次优先于 displayOrder', () => {
    const en = fv('1', 'english_definition', 0)
    const zh = fv('2', 'chinese_definition', 5)
    expect(compareSiblings(keyOf, 'part_of_speech', en, zh)).toBeGreaterThan(0)
  })
  it('同类型按 displayOrder', () => {
    const a = fv('1', 'chinese_definition', 3)
    const b = fv('2', 'chinese_definition', 1)
    expect(compareSiblings(keyOf, 'part_of_speech', a, b)).toBeGreaterThan(0)
  })
})

describe('sortTreeByTemplate', () => {
  it('根级递归排序：乱序输入 → 模板序', () => {
    const roots = [
      fv('s', 'exchange', 3),
      fv('r', 'phonetic', 0),
      fv('q', 'part_of_speech', 1),
      fv('p', 'part_of_speech', 2),
    ]
    const sorted = sortTreeByTemplate(keyOf, roots)
    expect(sorted.map(x => keyOf(x))).toEqual(['phonetic', 'part_of_speech', 'part_of_speech', 'exchange'])
  })
  it('词性下子级：中文排前', () => {
    const pos = { ...fv('p', 'part_of_speech', 0), children: [fv('b', 'english_definition', 0), fv('a', 'chinese_definition', 0)] }
    const sorted = sortTreeByTemplate(keyOf, [pos])
    expect(sorted[0].children!.map(x => keyOf(x))).toEqual(['chinese_definition', 'english_definition'])
  })
})

describe('字段归属', () => {
  it('ROOT_FIELD_KEYS 为 8 个根级字段', () => {
    expect(ROOT_FIELD_KEYS).toEqual(['phonetic', 'part_of_speech', 'supplementary', 'phrase', 'exchange', 'derivatives', 'word_root', 'synonym_discrimination'])
  })
  it('词性下仅允许中/英释义', () => {
    expect(ALLOWED_CHILD_KEYS.part_of_speech).toEqual(['chinese_definition', 'english_definition'])
  })
  it('释义下允许场景/例句/近义词', () => {
    expect(ALLOWED_CHILD_KEYS.chinese_definition).toEqual(['usage_scenario', 'example_sentence', 'synonyms'])
  })
})

it('word_root 是根级字段，位次 6，位于 derivatives(5) 之后', () => {
  expect(templateRank(null, 'word_root')).toBe(6)
  expect(templateRank(null, 'derivatives')).toBe(5)
  expect(ROOT_FIELD_KEYS).toContain('word_root')
})

it('word_root 允许直接子级 word_root_item', () => {
  expect(ALLOWED_CHILD_KEYS.word_root).toEqual(['word_root_item'])
  expect(templateRank('word_root', 'word_root_item')).toBe(0)
})

it('synonym_discrimination 是根级字段位次 7，允许直接子级 synonym_discrimination_item', () => {
  expect(ALLOWED_CHILD_KEYS.synonym_discrimination).toEqual(['synonym_discrimination_item', 'synonym_discrimination_group'])
  expect(ALLOWED_CHILD_KEYS.synonym_discrimination_group).toEqual(['synonym_discrimination_item'])
  expect(templateRank(null, 'synonym_discrimination')).toBe(7)
})

it('word_root 内建字段已注册（BUILTIN_FIELDS 计数 21）', () => {
  expect(BUILTIN_FIELDS.word_root).toEqual({ name: '词根', fieldType: 'text', displayOrder: 18 })
  expect(BUILTIN_FIELDS.word_root_item).toEqual({ name: '词根项', fieldType: 'text', displayOrder: 19 })
  expect(Object.keys(BUILTIN_FIELDS)).toHaveLength(22)
})
