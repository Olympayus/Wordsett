import { describe, expect, it } from 'vitest'
import { childKind, leafForm } from './fieldKind'

describe('childKind（v0.7.3 尾段 §1.4：容器决定子级的展示形式）', () => {
  it('例句容器是 example —— 一条一句话，不是清单', () => {
    expect(childKind('example_sentence')).toBe('example')
  })
  it('六个列举容器都是 list', () => {
    for (const k of ['synonyms', 'derivatives', 'exchange', 'supplementary', 'phrase', 'word_root']) {
      expect(childKind(k), k).toBe('list')
    }
  })
  it('表外一律 plain —— 含用户自建字段与辨析组', () => {
    expect(childKind('custom_field_abc')).toBe('plain')
    expect(childKind('synonym_discrimination_group')).toBe('plain')
  })
})

describe('leafForm（同一张表的叶子侧）', () => {
  it('例句叶子与英文释义各自成形，其余 plain', () => {
    expect(leafForm('example')).toBe('example')
    expect(leafForm('english_definition')).toBe('english-def')
    expect(leafForm('chinese_definition')).toBe('plain')
  })
})
