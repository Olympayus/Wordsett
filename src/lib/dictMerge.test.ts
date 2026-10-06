import { describe, it, expect } from 'vitest'
import { mergeSources, normalizeEnglishDef } from './dictMerge'
import type { DictionaryEntry, DictionaryField } from '../types/dictionary'

const ec = (fields: DictionaryField[]): DictionaryEntry => ({ word: 'x', normalizedWord: 'x', source: 'ecdict', fields })
const wn = (fields: DictionaryField[]): DictionaryEntry => ({ word: 'x', normalizedWord: 'x', source: 'wordnet', fields })
const pos = (value: string, children: DictionaryField[]): DictionaryField => ({ key: 'part_of_speech', value, children })
const en = (value: string, children?: DictionaryField[]): DictionaryField =>
  children ? { key: 'english_definition', value, children } : { key: 'english_definition', value }
const zh = (value: string): DictionaryField => ({ key: 'chinese_definition', value })
const defsOf = (fields: DictionaryField[]) =>
  (fields.find(f => f.key === 'part_of_speech')!.children ?? []).filter(c => c.key === 'english_definition')

describe('mergeSources', () => {
  it('同一词性合流成一个父，且每个节点都盖上来源戳', () => {
    const merged = mergeSources([
      ec([pos('n.', [zh('苹果')])]),
      wn([pos('n.', [en('fruit with red or yellow or green skin')])]),
    ])
    const pos_ = merged.filter(f => f.key === 'part_of_speech')
    expect(pos_).toHaveLength(1)
    expect(pos_[0].source).toBe('ecdict')          // 先到的那个父节点
    expect(pos_[0].children!.map(c => c.source)).toEqual(['ecdict', 'wordnet'])
  })

  it('逐字重复的英文释义只留 WordNet 那条，例句子树跟着留下', () => {
    const merged = mergeSources([
      ec([pos('n.', [en('the act of degrading people with respect to their best qualities')])]),
      wn([pos('n.', [en('the act of degrading people with respect to their best qualities', [
        { key: 'example_sentence', value: '', children: [{ key: 'example', value: '"science has been blamed"' }] },
      ])])]),
    ])
    const defs = defsOf(merged)
    expect(defs).toHaveLength(1)
    expect(defs[0].source).toBe('wordnet')
    expect(defs[0].children).toHaveLength(1)
  })

  it('WordNet 没有该词：ecdict 的英文释义原样保留并标 ecdict', () => {
    const merged = mergeSources([ec([pos('v.', [en('to grow and send out branches or branch-like structures')])])])
    const defs = defsOf(merged)
    expect(defs).toHaveLength(1)
    expect(defs[0].source).toBe('ecdict')
  })

  it('反例：只部分重合的两条都留下（只去掉真正相等的那条）', () => {
    const merged = mergeSources([
      ec([pos('n.', [en('a turn to be a starter')])]),
      wn([pos('n.', [en('a turn to be a starter in a game'), en('the act of starting')])]),
    ])
    expect(defsOf(merged)).toHaveLength(3)
  })

  it('反例：中文释义不参与去重', () => {
    const merged = mergeSources([ec([pos('n.', [zh('大气')])]), wn([pos('n.', [zh('大气')])])])
    expect(merged[0].children!.filter(c => c.key === 'chinese_definition')).toHaveLength(2)
  })

  it('反例：不同词性不合流', () => {
    const merged = mergeSources([ec([pos('n.', [zh('大气')])]), wn([pos('v.', [en('to observe')])])])
    expect(merged.filter(f => f.key === 'part_of_speech')).toHaveLength(2)
  })
})

describe('normalizeEnglishDef', () => {
  it('大小写 / 词性前缀 / 括号补充 / 标点 / 引号例句段都判等', () => {
    const base = normalizeEnglishDef('a male singer who was castrated before puberty')
    expect(normalizeEnglishDef('N. A male singer who was castrated before puberty.')).toBe(base)
    expect(normalizeEnglishDef('a male singer who was castrated (in childhood) before puberty')).toBe(base)
    expect(normalizeEnglishDef('a male singer, who was castrated, before puberty')).toBe(base)
    expect(normalizeEnglishDef('a male singer who was castrated before puberty; "he was one"')).toBe(base)
  })

  it('实质不同的文本不判等', () => {
    expect(normalizeEnglishDef('a turn to be a starter'))
      .not.toBe(normalizeEnglishDef('a turn to be a starter in a game'))
  })
})
