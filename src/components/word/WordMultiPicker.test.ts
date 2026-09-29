import { describe, it, expect } from 'vitest'
import { pickerWords, pickerConfirmLabel } from './WordMultiPicker'
import type { WordWithPreview } from '../../types/word'

const w = (id: string, lemma: string): WordWithPreview => ({
  id, lemma, normalizedLemma: lemma, language: 'en', createdAt: 1, updatedAt: 1,
})

const ALL = [w('1', 'alpha'), w('2', 'beta'), w('3', 'gamma')]

describe('pickerWords（v0.6.5 §4.3：方向固定，不做差集）', () => {
  it('加入方向：列全库，不受现有成员影响', () => {
    expect(pickerWords(ALL, new Set(['1']), 'add', '').map(x => x.id)).toEqual(['1', '2', '3'])
  })

  it('移除方向：只列该分类现有成员', () => {
    expect(pickerWords(ALL, new Set(['1', '3']), 'remove', '').map(x => x.id)).toEqual(['1', '3'])
  })

  it('搜索在方向过滤之后生效——移除入口搜不到非成员', () => {
    expect(pickerWords(ALL, new Set(['1']), 'remove', 'beta')).toEqual([])
    expect(pickerWords(ALL, new Set(['1']), 'add', 'beta').map(x => x.id)).toEqual(['2'])
  })

  it('忽略大小写与首尾空白', () => {
    expect(pickerWords(ALL, new Set(), 'add', '  ALP ').map(x => x.id)).toEqual(['1'])
  })
})

describe('pickerConfirmLabel', () => {
  it('两个方向各自的文案与数字', () => {
    expect(pickerConfirmLabel('add', 3)).toBe('加入 3 个单词')
    expect(pickerConfirmLabel('remove', 1)).toBe('移除 1 个单词')
  })
})
