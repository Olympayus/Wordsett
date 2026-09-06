import { describe, it, expect } from 'vitest'
import { buildSynonymDiscriminationFields } from './synonymDisc'

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