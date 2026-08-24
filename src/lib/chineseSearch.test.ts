import { describe, it, expect } from 'vitest'
import { isChineseQuery, rankChineseResults } from './chineseSearch'

describe('isChineseQuery', () => {
  it('detects CJK characters', () => {
    expect(isChineseQuery('苹果')).toBe(true)
    expect(isChineseQuery('狗尾巴')).toBe(true)
    expect(isChineseQuery('dog')).toBe(false)
    expect(isChineseQuery('中英混合 app')).toBe(true)
    expect(isChineseQuery('')).toBe(false)
    expect(isChineseQuery('   ')).toBe(false)
  })
})

describe('rankChineseResults', () => {
  const rows = [
    { word: 'apple', translation: '苹果；苹果树' },
    { word: 'pineapple', translation: '菠萝' },
    { word: 'apply', translation: '申请；应用' },
    { word: 'pie', translation: '馅饼' },
    { word: 'applet', translation: '苹果汁' },
  ]
  it('returns only rows whose translation contains the query', () => {
    const result = rankChineseResults(rows, '苹果')
    expect(result).toContain('apple')
    expect(result).toContain('applet')
    expect(result).not.toContain('pineapple')
    expect(result).not.toContain('pie')
  })
  it('ranks exact translation match first', () => {
    const result = rankChineseResults([
      { word: 'apple', translation: '苹果；苹果树' },
      { word: 'exactmatch', translation: '苹果' },
    ], '苹果')
    expect(result[0]).toBe('exactmatch') // translation.trim() === query 的精确匹配排在仅包含之上
  })
  it('ranks earlier match position higher', () => {
    const early = rankChineseResults(
      [{ word: 'early', translation: '苹果在开头' }, { word: 'late', translation: '结尾才有苹果' }],
      '苹果'
    )
    expect(early[0]).toBe('early')
  })
  it('prefers shorter word when positions tie', () => {
    const result = rankChineseResults(
      [{ word: 'longlong', translation: 'x苹果' }, { word: 'ab', translation: 'x苹果' }],
      '苹果'
    )
    expect(result[0]).toBe('ab')
  })
  it('dedupes repeated words and caps at 20', () => {
    const dup = [{ word: 'a', translation: '苹果' }, { word: 'a', translation: '苹果' }]
    expect(rankChineseResults(dup, '苹果')).toEqual(['a'])
    const many = Array.from({ length: 25 }, (_, i) => ({ word: `w${i}`, translation: '苹果' }))
    expect(rankChineseResults(many, '苹果').length).toBe(20)
  })

  describe('词频排序（v0.4.4）', () => {
    it('有词频的常用词稳压「位置更靠前但无词频」的冷僻词（interesting vs brain-teaser）', () => {
      const result = rankChineseResults([
        { word: 'brain-teaser', translation: '有趣的难题', collins: 0, frq: 0 },
        { word: 'interesting', translation: 'a. 有趣的', collins: 3, frq: 1072 },
        { word: 'rorty', translation: 'a. 有趣的', collins: 0, frq: 0 },
      ], '有趣的')
      expect(result[0]).toBe('interesting')
      expect(result[1]).toBe('brain-teaser') // 均无词频，回退位置键：idx 0 < 3
      expect(result[2]).toBe('rorty')
    })
    it('同有词频时按 frq 升序（COCA 词频越低越常用）', () => {
      const result = rankChineseResults([
        { word: 'amusing', translation: 'a. 有趣的, 引人发笑的', collins: 2, frq: 9042 },
        { word: 'funny', translation: 'a. 好笑的, 有趣的', collins: 3, frq: 1789 },
      ], '有趣的')
      expect(result[0]).toBe('funny')
    })
    it('exact 匹配仍压过有词频但不 exact 的词（exact 是第一键）', () => {
      const result = rankChineseResults([
        { word: 'interesting', translation: 'a. 有趣的', collins: 3, frq: 1072 },
        { word: 'exactword', translation: '有趣的', collins: 0, frq: 0 },
      ], '有趣的')
      expect(result[0]).toBe('exactword')
    })
    it('无 frq 但有 collins 时按 collins 降序兜底', () => {
      const result = rankChineseResults([
        { word: 'lowstar', translation: 'x有趣的', collins: 1, frq: 0 },
        { word: 'highstar', translation: 'x有趣的', collins: 4, frq: 0 },
      ], '有趣的')
      expect(result[0]).toBe('highstar')
    })
  })
})
