import { describe, it, expect } from 'vitest'
import type { WordLocation } from '../types/word'
import { highlightSegments, searchRows } from './mobileSearch'

describe('searchRows', () => {
  it('单列建议带已收录标识', () => {
    // 字面量数组的元素类型是 string（不是 WordLocation），故显式标注——`searchRows` 的入参
    // 与 store 的 `libraryIndex` 同为 `ReadonlyMap<string, WordLocation>`。
    const index = new Map<string, WordLocation>([['animate', 'workspace'], ['animosity', 'archive']])
    const rows = searchRows(['animate', 'anima', 'animosity'], index, { animate: '使有生气' })
    expect(rows[0]).toEqual({ lemma: 'animate', gloss: '使有生气', collected: '已在工作台' })
    expect(rows[1].collected).toBeNull()
    expect(rows[2].collected).toBe('已在储藏库')
  })
})

describe('highlightSegments', () => {
  it('highlightSegments_marks_all_cases', () => {
    expect(highlightSegments('Vocabulary is broad', 'vocab')).toEqual([
      { text: 'Vocab', hit: true }, { text: 'ulary is broad', hit: false },
    ])
  })
  it('highlightSegments_empty_query_no_hits', () => {
    expect(highlightSegments('abc', '')).toEqual([{ text: 'abc', hit: false }])
  })
  // 重叠不重复：`indexOf` 从上一段命中结尾继续找，`aaaa` 查 `aa` 得到两段而不是三段。
  it('highlightSegments_non_overlapping', () => {
    expect(highlightSegments('aaaa', 'aa')).toEqual([
      { text: 'aa', hit: true }, { text: 'aa', hit: true },
    ])
  })
})
