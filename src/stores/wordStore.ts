import { create } from 'zustand'
import type { Word, WordWithPreview, FieldValue } from '../types'
import type { FieldValueContentUpdate } from '../types/field'
import * as wordService from '../services/wordService'
import type { MergeFieldInput } from '../services/wordService'
import * as fieldService from '../services/fieldService'
import { useCategoryStore } from './categoryStore'
import { useNavHistoryStore } from './navHistoryStore'

interface WordStore {
  words: WordWithPreview[]
  loading: boolean
  selectedWordId: string | null
  fieldValues: FieldValue[]

  loadWords: () => Promise<void>
  selectWord: (id: string | null, opts?: { record?: boolean }) => Promise<void>
  updateFieldValue: (fvId: string, input: FieldValueContentUpdate) => Promise<void>
  restoreFieldValue: (fvId: string) => Promise<void>
  addFieldValue: (fieldId: string, parentId?: string | null) => Promise<FieldValue | null>
  deleteFieldValue: (fvId: string) => Promise<void>
  reorderFieldValues: (entries: { id: string; displayOrder: number }[]) => Promise<void>
  addWord: (lemma: string) => Promise<Word | null>
  mergeWordFields: (wordId: string, fields: MergeFieldInput[]) => Promise<boolean>
  deleteWord: (id: string) => Promise<void>
}

export const useWordStore = create<WordStore>((set, get) => ({
  words: [],
  loading: false,
  selectedWordId: null,
  fieldValues: [],

  loadWords: async () => {
    set({ loading: true })
    const words = await wordService.getPreviews()
    set({ words, loading: false })
  },

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
    // 历史栈清理：被删词条若在栈内，回退时不得落到空词条（v0.5.2 §6）
    useNavHistoryStore.getState().dropId(id)
    if (get().selectedWordId === id) {
      set({ selectedWordId: null, fieldValues: [] })
    }
    await get().loadWords()
  },

  addWord: async (lemma) => {
    const word = await wordService.addWord(lemma)
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
