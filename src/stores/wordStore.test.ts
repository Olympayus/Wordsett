import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../services/wordService', () => ({
  getPreviews: vi.fn(),
  getLemmaLocations: vi.fn(),
  getLocationCounts: vi.fn(),
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
    vi.mocked(wordService.getLemmaLocations).mockResolvedValue([])
    vi.mocked(wordService.getLocationCounts).mockResolvedValue({ total: 0, workspace: 0, archive: 0 })
  })

  it('合并成功 → 刷新侧边栏预览列表（音标/词性即时显示）', async () => {
    const previews = [
      { id: 'w1', lemma: 'apple', normalizedLemma: 'apple', language: 'en', location: 'workspace' as const, createdAt: 1, updatedAt: 1, phonetic: '/ˈæpl/', partOfSpeechTags: ['n'] },
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

describe('wordStore.libraryIndex / counts（v0.7.5 Task 9：两个模块的词库索引）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWordStore.setState({
      words: [],
      fieldValues: [],
      selectedWordId: null,
      location: 'workspace',
      libraryIndex: new Map(),
      counts: { total: 0, workspace: 0, archive: 0 },
    })
    vi.mocked(wordService.getPreviews).mockResolvedValue([])
    vi.mocked(wordService.getLemmaLocations).mockResolvedValue([])
    vi.mocked(wordService.getLocationCounts).mockResolvedValue({ total: 0, workspace: 0, archive: 0 })
  })

  it('索引由两个模块的轻量查询构建（不再只覆盖工作区），并刷新三档计数', async () => {
    vi.mocked(wordService.getPreviews).mockResolvedValue([
      { id: 'w1', lemma: 'Abandon', normalizedLemma: 'abandon', language: 'en', location: 'workspace' as const, createdAt: 1, updatedAt: 1 },
    ])
    vi.mocked(wordService.getLemmaLocations).mockResolvedValue([
      { normalizedLemma: 'abandon', location: 'workspace' },
      { normalizedLemma: 'forsake', location: 'archive' },
    ])
    vi.mocked(wordService.getLocationCounts).mockResolvedValue({ total: 2, workspace: 1, archive: 1 })

    await useWordStore.getState().loadWords()

    const s = useWordStore.getState()
    expect(wordService.getPreviews).toHaveBeenCalledWith('workspace')
    expect(s.libraryIndex.get('abandon')).toBe('workspace')
    expect(s.libraryIndex.get('forsake')).toBe('archive')
    expect(s.libraryLocationOf(' FORSAKE ')).toBe('archive')
    expect(s.libraryLocationOf('unknown')).toBeNull()
    expect(s.counts).toEqual({ total: 2, workspace: 1, archive: 1 })
  })

  it('储藏库模块里加载：词表只出储藏库，索引仍含工作区词（不能只看当前模块）', async () => {
    useWordStore.setState({ location: 'archive' })
    vi.mocked(wordService.getPreviews).mockResolvedValue([
      { id: 'w2', lemma: 'forsake', normalizedLemma: 'forsake', language: 'en', location: 'archive' as const, createdAt: 1, updatedAt: 1 },
    ])
    vi.mocked(wordService.getLemmaLocations).mockResolvedValue([
      { normalizedLemma: 'abandon', location: 'workspace' },
      { normalizedLemma: 'forsake', location: 'archive' },
    ])

    await useWordStore.getState().loadWords()

    expect(wordService.getPreviews).toHaveBeenCalledWith('archive')
    expect(useWordStore.getState().words.map(w => w.id)).toEqual(['w2'])
    expect(useWordStore.getState().libraryLocationOf('abandon')).toBe('workspace')
  })

  it('setLocation：设置模块、清空选中、按新模块加载并刷新索引与计数', async () => {
    useWordStore.setState({ selectedWordId: 'w1', fieldValues: [{ id: 'fv1' } as never] })
    vi.mocked(wordService.getPreviews).mockImplementation(async (location) =>
      location === 'archive'
        ? [{ id: 'w2', lemma: 'forsake', normalizedLemma: 'forsake', language: 'en', location: 'archive' as const, createdAt: 1, updatedAt: 1 }]
        : [{ id: 'w1', lemma: 'abandon', normalizedLemma: 'abandon', language: 'en', location: 'workspace' as const, createdAt: 1, updatedAt: 1 }]
    )
    vi.mocked(wordService.getLemmaLocations).mockResolvedValue([
      { normalizedLemma: 'abandon', location: 'workspace' },
      { normalizedLemma: 'forsake', location: 'archive' },
    ])
    vi.mocked(wordService.getLocationCounts).mockResolvedValue({ total: 2, workspace: 1, archive: 1 })

    await useWordStore.getState().setLocation('archive')

    const s = useWordStore.getState()
    expect(s.location).toBe('archive')
    expect(s.selectedWordId).toBeNull()
    expect(s.fieldValues).toEqual([])
    expect(s.words.map(w => w.id)).toEqual(['w2'])
    expect(s.libraryLocationOf('forsake')).toBe('archive')
    expect(s.counts).toEqual({ total: 2, workspace: 1, archive: 1 })
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
    vi.mocked(wordService.getLemmaLocations).mockResolvedValue([])
    vi.mocked(wordService.getLocationCounts).mockResolvedValue({ total: 0, workspace: 0, archive: 0 })
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
