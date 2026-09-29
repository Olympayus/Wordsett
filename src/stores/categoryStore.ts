import { create } from 'zustand'
import type { Category, CategoryInput, CategoryUpdate } from '../types/category'
import * as categoryService from '../services/categoryService'
import { useWordStore } from './wordStore'

interface CategoryStore {
  categories: Category[]
  wordCategoryIds: string[]
  wordCategoryMap: Record<string, string[]>
  loading: boolean
  loadCategories: () => Promise<void>
  loadWordCategoryMap: () => Promise<void>
  loadWordCategories: (wordId: string) => Promise<void>
  createCategory: (input: CategoryInput) => Promise<Category | null>
  updateCategory: (id: string, update: CategoryUpdate) => Promise<void>
  deleteCategory: (id: string) => Promise<void>
  assignToWord: (wordId: string, categoryId: string) => Promise<void>
  removeFromWord: (wordId: string, categoryId: string) => Promise<void>
  assignMany: (wordIds: string[], categoryId: string) => Promise<void>
  unassignMany: (wordIds: string[], categoryId: string) => Promise<void>
  refreshWordCategories: () => Promise<void>
}

export const useCategoryStore = create<CategoryStore>((set, get) => ({
  categories: [],
  wordCategoryIds: [],
  wordCategoryMap: {},
  loading: false,

  loadCategories: async () => {
    set({ loading: true })
    const categories = await categoryService.getCategories()
    set({ categories, loading: false })
  },

  loadWordCategoryMap: async () => {
    const wordCategoryMap = await categoryService.getWordCategoryMap()
    set({ wordCategoryMap })
  },

  // 切换单词先清空，避免闪现上一个单词的分类胶囊
  loadWordCategories: async (wordId) => {
    set({ wordCategoryIds: [] })
    const cats = await categoryService.getWordCategories(wordId)
    if (useWordStore.getState().selectedWordId === wordId) {
      set({ wordCategoryIds: cats.map(c => c.id) })
    }
  },

  createCategory: async (input) => {
    const category = await categoryService.createCategory(input)
    if (category) await get().loadCategories()
    return category
  },

  updateCategory: async (id, update) => {
    await categoryService.updateCategory(id, update)
    await get().loadCategories()
  },

  deleteCategory: async (id) => {
    await categoryService.deleteCategory(id)
    await get().loadCategories()
    await get().refreshWordCategories()
    await get().loadWordCategoryMap()
  },

  assignToWord: async (wordId, categoryId) => {
    await categoryService.assignCategoryToWord(wordId, categoryId)
    await get().loadWordCategories(wordId)
    await get().loadWordCategoryMap()
  },

  removeFromWord: async (wordId, categoryId) => {
    await categoryService.unassignCategoryFromWord(wordId, categoryId)
    await get().loadWordCategories(wordId)
    await get().loadWordCategoryMap()
  },

  // 批量版不刷新 wordCategoryIds（当前词的那份）——选择的是一批词，不是当前词。
  // 只刷 wordCategoryMap，侧栏分组与胶囊由它驱动。
  assignMany: async (wordIds, categoryId) => {
    await categoryService.assignCategoryToWords(wordIds, categoryId)
    await get().loadWordCategoryMap()
  },

  unassignMany: async (wordIds, categoryId) => {
    await categoryService.unassignCategoryFromWords(wordIds, categoryId)
    await get().loadWordCategoryMap()
  },

  refreshWordCategories: async () => {
    const wordId = useWordStore.getState().selectedWordId
    if (wordId) await get().loadWordCategories(wordId)
  },
}))
