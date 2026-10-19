import { describe, it, expect, vi } from 'vitest'
import { useWordStore } from '../stores/wordStore'
import { ensureWord, isWordInLibrary } from './ensureWord'
import type { Word, WordLocation } from '../types/word'

describe('ensureWord', () => {
  it('有存量（case-insensitive）直接返回，不重复创建', async () => {
    const existing = { id: 'w1', lemma: 'observe' } as Word
    const addWord = vi.fn()
    useWordStore.setState({ words: [existing as never], addWord: addWord as never })
    const w = await ensureWord('OBSERVE')
    expect(w?.id).toBe('w1')
    expect(addWord).not.toHaveBeenCalled()
  })

  it('无存量时调用 addWord 创建', async () => {
    const created = { id: 'w2', lemma: 'ball' } as Word
    const addWord = vi.fn().mockResolvedValue(created)
    useWordStore.setState({ words: [], addWord: addWord as never })
    const w = await ensureWord('ball')
    // 不传 opts 时 ensureWord 照样把第二参原样透传下去（undefined），「＋」路径的
    // skipDefaultCategory 正是靠这条透传到达 addWord——所以断言要带上那个 undefined。
    expect(addWord).toHaveBeenCalledWith('ball', undefined)
    expect(w?.id).toBe('w2')
  })
})

describe('isWordInLibrary（v0.7.5 Task 9：索引含两个模块）', () => {
  it('储藏库里的词也算在库', () => {
    useWordStore.setState({
      words: [],
      libraryIndex: new Map<string, WordLocation>([['forsake', 'archive']]),
    })
    expect(isWordInLibrary(' FORSAKE ')).toBe(true)
    expect(isWordInLibrary('abandon')).toBe(false)
  })
})

describe('ensureWord 与储藏库', () => {
  it('只在储藏库的同名词交给 addWord 取既有行，不新建', async () => {
    const existing = { id: 'w9', lemma: 'forsake' } as Word
    const addWord = vi.fn().mockResolvedValue(existing)
    useWordStore.setState({
      words: [],
      libraryIndex: new Map<string, WordLocation>([['forsake', 'archive']]),
      addWord: addWord as never,
    })
    const w = await ensureWord('Forsake')
    expect(addWord).toHaveBeenCalledWith('Forsake', undefined)
    expect(w?.id).toBe('w9')
  })
})
