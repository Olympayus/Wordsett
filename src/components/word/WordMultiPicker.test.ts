import { describe, it, expect } from 'vitest'
import { pickerWords, pickerConfirmLabel } from './WordMultiPicker'
import type { WordWithPreview } from '../../types/word'

const w = (id: string, lemma: string): WordWithPreview => ({
  id, lemma, normalizedLemma: lemma, language: 'en', createdAt: 1, updatedAt: 1,
})

const ALL = [w('1', 'alpha'), w('2', 'beta'), w('3', 'gamma')]

describe('pickerWords（v0.6.5 §4.3：方向固定，不做差集）', () => {
  it('加入方向：已在成员里的词不再列出（列出来等于让人重复写一次归属）', () => {
    expect(pickerWords(ALL, new Set(['1']), 'add', '').map(x => x.id)).toEqual(['2', '3'])
  })

  it('移除方向：只列该分类现有成员', () => {
    expect(pickerWords(ALL, new Set(['1', '3']), 'remove', '').map(x => x.id)).toEqual(['1', '3'])
  })

  it('两个方向是同一谓词的取反，成员集为空时恰好互补', () => {
    const members = new Set(['2'])
    const add = pickerWords(ALL, members, 'add', '').map(x => x.id)
    const remove = pickerWords(ALL, members, 'remove', '').map(x => x.id)
    expect(add).toEqual(['1', '3'])
    expect(remove).toEqual(['2'])
    expect([...add, ...remove].sort()).toEqual(ALL.map(x => x.id).sort())
  })

  it('搜索在方向过滤之后生效——移除入口搜不到非成员', () => {
    expect(pickerWords(ALL, new Set(['1']), 'remove', 'beta')).toEqual([])
    expect(pickerWords(ALL, new Set(['1']), 'add', 'beta').map(x => x.id)).toEqual(['2'])
  })

  it('忽略大小写与首尾空白', () => {
    expect(pickerWords(ALL, new Set(), 'add', '  ALP ').map(x => x.id)).toEqual(['1'])
  })

  it('全部词都已是成员时，加入方向列空（这是收窄候选集后的新空态）', () => {
    expect(pickerWords(ALL, new Set(['1', '2', '3']), 'add', '')).toEqual([])
  })

  // 评审 Important #1 的哨兵：预勾选取自 pickerWords(words, members, 'remove', '')，
  // 成员为空时它必须返回空——退回「拿 memberIds 直接播种」的那版，这里就会红。
  it('空成员集在移除方向下列不出任何词（预勾选不得凭空出现）', () => {
    expect(pickerWords(ALL, new Set(), 'remove', '')).toEqual([])
  })
})

describe('pickerConfirmLabel', () => {
  it('两个方向各自的文案与数字', () => {
    expect(pickerConfirmLabel('add', 3)).toBe('加入 3 个单词')
    expect(pickerConfirmLabel('remove', 1)).toBe('移除 1 个单词')
  })
})
