import { describe, it, expect } from 'vitest'
import { buildSynonymDiscriminationFields } from './synonymDisc'

describe('buildSynonymDiscriminationFields', () => {
  it('每组一个容器：value=描述，项 value=word: 辨析释义', () => {
    const groups = [{
      description: '这组词都有「相当，颇」的意思，其区别是：',
      items: [
        { word: 'quite', definition: '含义比 fairly 稍强' },
        { word: 'rather', definition: '语气比 quite 强' },
      ],
    }]
    const fields = buildSynonymDiscriminationFields(groups)
    expect(fields).toHaveLength(1)
    expect(fields[0]).toMatchObject({ key: 'synonym_discrimination', value: '这组词都有「相当，颇」的意思，其区别是：' })
    expect(fields[0].children?.map(c => c.value)).toEqual(['quite: 含义比 fairly 稍强', 'rather: 语气比 quite 强'])
  })
  it('空描述容器 value 为空串；缺定义项只存 word', () => {
    const fields = buildSynonymDiscriminationFields([{ description: '', items: [{ word: 'only', definition: '' }] }])
    expect(fields[0].value).toBe('')
    expect(fields[0].children?.[0].value).toBe('only')
  })
  it('一词多组 → 多容器', () => {
    const g1 = { description: '组一', items: [{ word: 'of', definition: 'd1' }] }
    const g2 = { description: '组二', items: [{ word: 'of', definition: 'd2' }] }
    expect(buildSynonymDiscriminationFields([g1, g2]).map(f => f.value)).toEqual(['组一', '组二'])
  })
})