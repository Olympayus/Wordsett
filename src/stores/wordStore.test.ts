import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../services/wordService', () => ({
  getPreviews: vi.fn(),
  addWord: vi.fn(),
  mergeFields: vi.fn(),
  deleteWord: vi.fn(),
}))
vi.mock('../services/fieldService', () => ({
  getValues: vi.fn(),
}))

import { useWordStore } from './wordStore'
import * as wordService from '../services/wordService'
import * as fieldService from '../services/fieldService'
import { useNavHistoryStore } from './navHistoryStore'
import { current } from '../lib/navHistory'

describe('wordStore.mergeWordFields', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWordStore.setState({ words: [], fieldValues: [], selectedWordId: 'w1' })
  })

  it('合并成功 → 刷新侧边栏预览列表（音标/词性即时显示）', async () => {
    const previews = [
      { id: 'w1', lemma: 'apple', normalizedLemma: 'apple', language: 'en', createdAt: 1, updatedAt: 1, phonetic: '/ˈæpl/', partOfSpeechTags: ['n'] },
    ]
    vi.mocked(wordService.mergeFields).mockResolvedValue(true)
    vi.mocked(fieldService.getValues).mockResolvedValue([])
    vi.mocked(wordService.getPreviews).mockResolvedValue(previews)

    await useWordStore.getState().mergeWordFields('w1', [] as never)

    expect(wordService.getPreviews).toHaveBeenCalled()
    expect(useWordStore.getState().words).toEqual(previews)
  })

  it('合并失败 → 不刷新预览列表', async () => {
    vi.mocked(wordService.mergeFields).mockResolvedValue(false)

    await useWordStore.getState().mergeWordFields('w1', [] as never)

    expect(wordService.getPreviews).not.toHaveBeenCalled()
  })
})

describe('wordStore.deleteWord 历史栈同步（v0.5.2 §6 自动切词）', () => {
  const nav = () => useNavHistoryStore.getState()
  beforeEach(() => {
    vi.clearAllMocks()
    useWordStore.setState({ words: [], fieldValues: [], selectedWordId: null })
    nav().reset()
    vi.mocked(wordService.deleteWord).mockResolvedValue(true)
    vi.mocked(wordService.getPreviews).mockResolvedValue([])
    vi.mocked(fieldService.getValues).mockResolvedValue([])
  })

  it('删除当前词条 → 选中历史栈现在指向的邻居词条（栈与选中一致）', async () => {
    useWordStore.setState({ selectedWordId: 'c' })
    nav().record('a'); nav().record('b'); nav().record('c')

    await useWordStore.getState().deleteWord('c')

    expect(useWordStore.getState().selectedWordId).toBe('b')
    expect(current(useNavHistoryStore.getState().history)).toBe('b')
  })

  it('历史栈为空 → 删除当前词条后回空态', async () => {
    useWordStore.setState({ selectedWordId: 'b' })
    nav().record('b')

    await useWordStore.getState().deleteWord('b')

    expect(useWordStore.getState().selectedWordId).toBeNull()
  })

  it('删除非选中词条 → 选中项不动', async () => {
    useWordStore.setState({ selectedWordId: 'a' })
    nav().record('a'); nav().record('b')

    await useWordStore.getState().deleteWord('b')

    expect(useWordStore.getState().selectedWordId).toBe('a')
  })
})
