import { describe, it, expect, vi } from 'vitest'
import { useWordStore } from '../stores/wordStore'
import { ensureWord } from './ensureWord'
import type { Word } from '../types/word'

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
