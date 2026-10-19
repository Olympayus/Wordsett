import { create } from 'zustand'
import type { Word, WordWithPreview, FieldValue, WordLocation } from '../types'
import type { FieldValueContentUpdate } from '../types/field'
import * as wordService from '../services/wordService'
import type { MergeFieldInput } from '../services/wordService'
import * as fieldService from '../services/fieldService'
import { normalizeLinkTarget } from '../lib/links'
import { useCategoryStore } from './categoryStore'
import { useNavHistoryStore } from './navHistoryStore'
import { current } from '../lib/navHistory'

/**
 * 由已加载的词表构索引（v0.7.5 Task 3）：键与链接校验 / 反链匹配共用 `normalizeLinkTarget`。
 * 本任务只有工作区一个模块，值恒为 `'workspace'`；Task 9 起改由「工作区 ∪ 储藏库」的
 * 轻量查询构建，本函数届时退场。
 */
function buildLibraryIndex(words: WordWithPreview[]): Map<string, WordLocation> {
  return new Map(words.map(w => [normalizeLinkTarget(w.lemma), 'workspace' as const]))
}

interface WordStore {
  words: WordWithPreview[]
  loading: boolean
  selectedWordId: string | null
  fieldValues: FieldValue[]
  /**
   * 库内词条索引（v0.7.5 Task 3）：键 `normalizeLinkTarget(lemma)` → 所在模块。
   * 阅读态链接的「在不在库」判据（`LinkedText` 的失效态）与 Task 4 的跳转目标解析都读它。
   */
  libraryIndex: Map<string, WordLocation>

  loadWords: () => Promise<void>
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

export const useWordStore = create<WordStore>((set, get) => ({
  words: [],
  loading: false,
  selectedWordId: null,
  fieldValues: [],
  libraryIndex: new Map(),

  loadWords: async () => {
    set({ loading: true })
    const words = await wordService.getPreviews()
    set({ words, loading: false, libraryIndex: buildLibraryIndex(words) })
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
}))
