import { describe, expect, it } from 'vitest'
import { childKind, leafForm, rowTitle } from './fieldKind'

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

describe('rowTitle（§10：标题取组描述，不取字段名）', () => {
  it('辨析组取自己的值', () => {
    expect(rowTitle('synonym_discrimination_group', '残忍的', '近义词辨析组')).toBe('残忍的')
  })
  it('列举项不印标签', () => {
    expect(rowTitle('synonym_item', 'obvious', '近义词项')).toBe('')
    expect(rowTitle('example', 'Clear the table.', '例句')).toBe('')
  })
  it('其余走字段名', () => {
    expect(rowTitle('synonyms', '', '近义词')).toBe('近义词')
  })
  // v0.7.5 Task 5：标题类渲染一律纯文本——组描述里可能有链接标记，标题不渲染链接。
  it('辨析组标题把链接标记剥成词面', () => {
    expect(rowTitle('synonym_discrimination_group', '[[abandon]] 与 took 的差别', '近义词辨析组'))
      .toBe('abandon 与 took 的差别')
  })
})
