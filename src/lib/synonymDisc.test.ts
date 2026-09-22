import { describe, it, expect } from 'vitest'
import { buildSynonymDiscriminationFields, extractGroupTitle } from './synonymDisc'
import type { SynonymGroup } from './synonymDisc'

describe('buildSynonymDiscriminationFields', () => {
  it('单一根容器：value 空；每组为父级小标题（value=组描述），成员为其叶子', () => {
    const groups = [{
      description: '这组词都有「相当，颇」的意思，其区别是：',
      items: [
        { word: 'quite', definition: '含义比 fairly 稍强' },
        { word: 'rather', definition: '语气比 quite 强' },
      ],
    }]
    const fields = buildSynonymDiscriminationFields(groups)
    expect(fields).toHaveLength(1)
    expect(fields[0]).toMatchObject({ key: 'synonym_discrimination', value: '' })
    const group = fields[0].children![0]
    expect(group.key).toBe('synonym_discrimination_group')
    expect(group.value).toBe('这组词都有「相当，颇」的意思，其区别是：')
    expect(group.children!.map(c => c.value)).toEqual(['quite: 含义比 fairly 稍强', 'rather: 语气比 quite 强'])
  })
  it('空描述组 value 为空串；缺定义项只存 word', () => {
    const fields = buildSynonymDiscriminationFields([{ description: '', items: [{ word: 'only', definition: '' }] }])
    expect(fields[0].value).toBe('')
    const group = fields[0].children![0]
    expect(group.value).toBe('')
    expect(group.children?.[0].value).toBe('only')
  })
  it('一词多组 → 同一根下多个组父级（组边界保留，不并为一个容器）', () => {
    const g1 = { description: '组一', items: [{ word: 'of', definition: 'd1' }] }
    const g2 = { description: '组二', items: [{ word: 'of', definition: 'd2' }] }
    const fields = buildSynonymDiscriminationFields([g1, g2])
    expect(fields).toHaveLength(1)
    expect(fields[0].children!.map(g => g.value)).toEqual(['组一', '组二'])
  })
  it('无组时返回空数组（无孤立根容器）', () => {
    expect(buildSynonymDiscriminationFields([])).toEqual([])
  })
})

describe('extractGroupTitle', () => {
  const g = (description: string, words: string[]): SynonymGroup => ({
    description,
    items: words.map(w => ({ word: w, definition: '' })),
  })

  it('规则 1：这组词都有「X」的意思，其区别是： → 取 X', () => {
    expect(extractGroupTitle(g('这组词都有“展览”的意思，其区别是：', ['exhibition', 'show']))).toBe('展览')
    expect(extractGroupTitle(g('这组词都有「相当，颇」的意思，其区别是：', ['quite', 'rather']))).toBe('相当，颇')
  })

  it('规则 1 兼容直角引号与直引号', () => {
    expect(extractGroupTitle(g('这组词都有「迫使」的意思，其区别是:', ['force']))).toBe('迫使')
    expect(extractGroupTitle(g('这组词都有"混合"的意思，其区别是：', ['mix']))).toBe('混合')
  })

  it('规则 2：其他措辞含引号关键词 → 取引号内', () => {
    expect(extractGroupTitle(g('这些名词均有“陌生人，外人”之意。', ['stranger', 'alien']))).toBe('陌生人，外人')
    expect(extractGroupTitle(g('这两个动词均有“把……归于”之意。', ['ascribe']))).toBe('把……归于')
  })

  it('规则 3：无引号的措辞 → 保留原句', () => {
    expect(extractGroupTitle(g('这三词都与电有关', ['electric', 'electrical', 'electronic']))).toBe('这三词都与电有关')
    expect(extractGroupTitle(g('这是一组形近易混词。', ['a', 'b']))).toBe('这是一组形近易混词。')
  })

  it('规则 4：描述为空 → 成员词以 " & " 连接', () => {
    expect(extractGroupTitle(g('', ['await', 'wait']))).toBe('await & wait')
    expect(extractGroupTitle(g('', ['refuse', 'reject', 'deny', 'decline']))).toBe('refuse & reject & deny & decline')
  })

  it('规则 4 保持成员顺序（取 items 顺序）', () => {
    expect(extractGroupTitle(g('', ['highly', 'high']))).toBe('highly & high')
  })

  it('边界：描述与成员均空 → 空串', () => {
    expect(extractGroupTitle(g('', []))).toBe('')
  })

  it('边界：单成员且描述空 → 该词自身', () => {
    expect(extractGroupTitle(g('', ['solo']))).toBe('solo')
  })

  it('边界：规则 1/2 提取结果 trim 后为空 → 降级到成员词连接', () => {
    expect(extractGroupTitle(g('这组词都有“”的意思，其区别是：', ['fallback', 'word']))).toBe('fallback & word')
  })
})