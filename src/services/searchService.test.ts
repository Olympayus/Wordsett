import { describe, it, expect, vi } from 'vitest'
import { lookupWord } from './searchService'
import type { DictionaryEntry } from '../types/dictionary'

// mock 两个词典 provider：两个源返回同词性的中/英释义各一条，且英文释义逐字相同——
// 便于断言合流（同词性合成一个父）与去重（重复的英文释义只留 WordNet 那条）。
vi.mock('../providers/ecdict', () => ({
  EcdictProvider: class {
    readonly name = 'ecdict'
    async searchLemmas(): Promise<string[]> { return [] }
    async searchByChinese(): Promise<Array<{ word: string; translation: string }>> { return [] }
    async lookup(): Promise<DictionaryEntry[]> {
      return [{
        word: 'apple', normalizedWord: 'apple', source: 'ecdict', fields: [
          { key: 'part_of_speech', value: 'n.', children: [
            { key: 'chinese_definition', value: '苹果' },
            { key: 'english_definition', value: 'fruit with red or yellow or green skin' },
          ] },
        ],
      }]
    }
  },
}))

vi.mock('../providers/wordnet', () => ({
  WordNetProvider: class {
    readonly name = 'wordnet'
    async searchLemmas(): Promise<string[]> { return [] }
    async lookup(): Promise<DictionaryEntry[]> {
      return [{
        word: 'apple', normalizedWord: 'apple', source: 'wordnet', fields: [
          { key: 'part_of_speech', value: 'n.', children: [
            { key: 'english_definition', value: 'fruit with red or yellow or green skin' },
          ] },
        ],
      }]
    }
    async relatedWords() {
      return { path: [], groups: { synonyms: [], hypernyms: [], hyponyms: [], antonyms: [], partWhole: [], similarTo: [], alsoSee: [], derivatives: [] } }
    }
  },
}))

describe('lookupWord 两源合流（v0.8.x 词典合并）', () => {
  it('返回一棵树：同词性合流成一个父，重复的英文释义只留 WordNet 那条', async () => {
    const fields = await lookupWord('apple')
    const pos = fields.filter(f => f.key === 'part_of_speech')
    expect(pos).toHaveLength(1)
    const defs = pos[0].children!.filter(c => c.key === 'english_definition')
    expect(defs).toHaveLength(1)
    expect(defs[0].source).toBe('wordnet')
  })

  it('中文释义来自 ecdict，来源标记正确', async () => {
    const fields = await lookupWord('apple')
    const zh = fields[0].children!.filter(c => c.key === 'chinese_definition')
    expect(zh).toHaveLength(1)
    expect(zh[0].source).toBe('ecdict')
  })

  it('空查询返回空树', async () => {
    expect(await lookupWord('   ')).toEqual([])
  })
})
