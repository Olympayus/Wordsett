import { describe, it, expect } from 'vitest'
import type { WordLocation } from '../types/word'
import { searchRows } from './mobileSearch'

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
