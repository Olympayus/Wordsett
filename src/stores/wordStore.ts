import { create } from 'zustand'
import type { Word, WordWithPreview, FieldValue, WordLocation } from '../types'
import type { FieldValueContentUpdate } from '../types/field'
import * as wordService from '../services/wordService'
import type { MergeFieldInput } from '../services/wordService'
import * as fieldService from '../services/fieldService'
import { normalizeLinkTarget } from '../lib/links'
import { buildLibraryIndex } from '../lib/collected'
import { useCategoryStore } from './categoryStore'
import { useNavHistoryStore } from './navHistoryStore'
import { current } from '../lib/navHistory'

interface WordStore {
  words: WordWithPreview[]
  /**
   * 全库预览（工作区 ∪ 储藏库，v0.7.5 Task 14）。
   *
   * 两个消费点，都是模块无关的界面：设置页的批量管理弹层（候选集是两个模块的并集，
   * 每行还要标注所属模块）与分类分模块读数（词 id → 位置的唯一来源；
   * `libraryIndex` 的键是归一化词面，对不上 `wordCategoryMap` 的词 id）。
   * 由 `loadWords` 随当前模块词表一并刷新——它是所有词数据写入后的统一重载入口
   * （移入 / 移回 / 增删词 / 合并字段都走它），故不会出现「当前词表新、并集旧」。
   */
  libraryWords: WordWithPreview[]
  loading: boolean
  selectedWordId: string | null
  fieldValues: FieldValue[]
  /** 当前侧栏模块（v0.7.5 Task 9）：决定 `loadWords()` 取哪个模块的词表。 */
  location: WordLocation
  /**
   * 库内词条索引（v0.7.5 Task 3 起，Task 9 扩成两个模块）：键 `normalizeLinkTarget(lemma)`
   * → 所在模块。阅读态链接的「在不在库」判据（`LinkedText` 的失效态）与 Task 4 的跳转
   * 目标解析都读它。**必须由全库轻量查询构建**，不能拿当前模块的词表充数。
   */
  libraryIndex: Map<string, WordLocation>
  /** 词库三档计数：总数 / 工作区 / 储藏库（侧栏徽标与设置页共用）。 */
  counts: { total: number; workspace: number; archive: number }

  loadWords: () => Promise<void>
  /** 切模块：设置 `location`、清空选中，再按新模块加载词表（索引与计数随 `loadWords` 刷新）。 */
  setLocation: (location: WordLocation) => Promise<void>
  /** 移入储藏库（v0.7.5 Task 11）：只改位置、清选中、重载当前模块；复习卡与历史不动。 */
  moveToArchive: (id: string) => Promise<void>
  /** 移回工作台（v0.7.5 Task 11）：同上，方向相反。 */
  moveToWorkspace: (id: string) => Promise<void>
  /** 重建词库索引、三档计数与全库并集预览（`loadWords` 内顺带调；移入/移出后再调）。 */
  reloadLibraryIndex: () => Promise<void>
  /** 目标词所在模块；不在库返回 null。 */
  libraryLocationOf: (lemma: string) => WordLocation | null
  selectWord: (id: string | null, opts?: { record?: boolean }) => Promise<void>
  updateFieldValue: (fvId: string, input: FieldValueContentUpdate) => Promise<void>
  restoreFieldValue: (fvId: string) => Promise<void>
  addFieldValue: (fieldId: string, parentId?: string | null) => Promise<FieldValue | null>
  deleteFieldValue: (fvId: string) => Promise<void>
  reorderFieldValues: (entries: { id: string; displayOrder: number }[]) => Promise<void>
  addWord: (lemma: string, opts?: wordService.AddWordOptions) => Promise<Word | null>
  mergeWordFields: (wordId: string, fields: MergeFieldInput[]) => Promise<boolean>
  deleteWord: (id: string) => Promise<void>
  deleteWords: (ids: string[]) => Promise<void>
}

/**
 * 移入 / 移回的唯一实现（v0.7.5 Task 11）：只改位置，**复习卡与历史一律不动**
 * （Task 12 负责让它们不参与计算；删词才级联删）。
 * 成功后若移的正是当前选中词，回到空态——工作区不会停在一个已经离开本模块的词上。
 * 随后 `loadWords` 重载**当前模块**词表，并顺带重建索引与三档计数（`reloadLibraryIndex`）。
 * 确认框由调用点弹（菜单 / 批量条 / 导航条），store 不做 UI。
 */
async function moveWord(
  get: () => WordStore,
  set: (partial: Pick<WordStore, 'selectedWordId' | 'fieldValues'>) => void,
  id: string,
  to: WordLocation,
): Promise<void> {
  const ok = await wordService.setWordLocation(id, to)
  if (!ok) return
  if (get().selectedWordId === id) set({ selectedWordId: null, fieldValues: [] })
  await get().loadWords()
}

export const useWordStore = create<WordStore>((set, get) => ({
  words: [],
  libraryWords: [],
  loading: false,
  selectedWordId: null,
  fieldValues: [],
  location: 'workspace',
  libraryIndex: new Map(),
  counts: { total: 0, workspace: 0, archive: 0 },

  loadWords: async () => {
    set({ loading: true })
    // 当前模块词表与全库数据（并集预览 / 索引 / 计数）并行取：
    // 索引与计数不能只看当前模块（见 reloadLibraryIndex），并集预览同理。
    const [words] = await Promise.all([
      wordService.getPreviews(get().location),
      get().reloadLibraryIndex(),
    ])
    set({ words, loading: false })
  },

  setLocation: async (location) => {
    // 换模块即换数据集：选中词与字段列表一并清空（与 selectWord(null) 同样的空态），
    // 随后 loadWords 会顺带重建索引与三档计数。
    set({ location, selectedWordId: null, fieldValues: [] })
    await get().loadWords()
  },

  reloadLibraryIndex: async () => {
    const [libraryWords, rows, counts] = await Promise.all([
      wordService.getAllPreviews(),
      wordService.getLemmaLocations(),
      wordService.getLocationCounts(),
    ])
    set({ libraryWords, libraryIndex: buildLibraryIndex(rows), counts })
  },

  libraryLocationOf: (lemma) => get().libraryIndex.get(normalizeLinkTarget(lemma)) ?? null,

  selectWord: async (id, opts) => {
    // 仅切换单词时清空（加载态）；同名刷新（拖拽重排/编辑保存/还原/添加字段）保留列表，
    // 避免字段列表先坍缩再重取导致滚动容器 scrollTop 被钳到顶部（跳顶）。
    if (id !== get().selectedWordId) {
      set({ selectedWordId: id, fieldValues: [] })
      // 历史栈：仅记录非空的词条切换；箭头导航自身调用时传 record:false（v0.5.2 §6）
      if (id && opts?.record !== false) useNavHistoryStore.getState().record(id)
    }
    if (!id) return
    const values = await fieldService.getValues(id)
    set({ fieldValues: values })
  },

  updateFieldValue: async (fvId, input) => {
    const { selectedWordId } = get()
    if (!selectedWordId) return
    await fieldService.updateValueById(fvId, input)
    await get().selectWord(selectedWordId)
  },

  restoreFieldValue: async (fvId) => {
    const { selectedWordId } = get()
    if (!selectedWordId) return
    await fieldService.restoreValue(fvId)
    await get().selectWord(selectedWordId)
  },

  addFieldValue: async (fieldId, parentId) => {
    const { selectedWordId } = get()
    if (!selectedWordId) return null
    const fv = await fieldService.addFieldValue(selectedWordId, fieldId, parentId)
    await get().selectWord(selectedWordId)
    return fv
  },

  deleteFieldValue: async (fvId) => {
    const { selectedWordId } = get()
    if (!selectedWordId) return
    await fieldService.deleteValueCascade(fvId)
    await get().selectWord(selectedWordId)
  },

  reorderFieldValues: async (entries) => {
    const { selectedWordId } = get()
    if (!selectedWordId) return
    await fieldService.reorderValues(entries)
    await get().selectWord(selectedWordId)
  },

  deleteWord: async (id) => {
    const ok = await wordService.deleteWord(id)
    if (!ok) return
    const wasSelected = get().selectedWordId === id
    // 历史栈清理：被删词条若在栈内，回退时不得落到空词条（v0.5.2 §6）
    useNavHistoryStore.getState().dropId(id)
    if (wasSelected) {
      // 删除当前词条后的自动切词（spec §6 入栈时机）：落到历史栈现在指向的邻居词条；
      // 空栈则维持原来的空态。非选中词条的删除不动选中项。
      const neighbour = current(useNavHistoryStore.getState().history)
      if (neighbour) await get().selectWord(neighbour)
      else set({ selectedWordId: null, fieldValues: [] })
    }
    await get().loadWords()
  },

  deleteWords: async (ids) => {
    if (ids.length === 0) return
    const ok = await wordService.deleteWords(ids)
    if (!ok) return
    // 历史栈清理：被删的词若在栈内，回退时不得落到空词条（与单词版同一处理）
    for (const id of ids) useNavHistoryStore.getState().dropId(id)
    if (get().selectedWordId && ids.includes(get().selectedWordId!)) {
      const neighbour = current(useNavHistoryStore.getState().history)
      if (neighbour) await get().selectWord(neighbour)
      else set({ selectedWordId: null, fieldValues: [] })
    }
    await get().loadWords()
  },

  addWord: async (lemma, opts) => {
    const word = await wordService.addWord(lemma, opts)
    if (word) {
      await get().loadWords()
      await useCategoryStore.getState().loadWordCategoryMap()  // 新词默认分类即时进入侧边栏分组
    }
    return word
  },

  mergeWordFields: async (wordId, fields) => {
    const ok = await wordService.mergeFields(wordId, fields)
    if (ok) {
      const values = await fieldService.getValues(wordId)
      set({ fieldValues: values })
      // 刷新侧边栏预览（音标/词性即时显示，无需手动刷新；v0.4.3 §4）
      await get().loadWords()
    }
    return ok
  },

  moveToArchive: (id) => moveWord(get, set, id, 'archive'),
  moveToWorkspace: (id) => moveWord(get, set, id, 'workspace'),
}))
