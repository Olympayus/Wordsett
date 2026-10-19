import * as categoriesDb from '../db/categories'
import type { Category } from '../types/category'
import type { CategoryInput, CategoryUpdate } from '../types/category'
import type { WordLocation } from '../types/word'

export async function getCategories(): Promise<Category[]> {
  const result = await categoriesDb.getAllCategories()
  return result.ok ? result.data : []
}

export async function getWordCategories(wordId: string): Promise<Category[]> {
  const result = await categoriesDb.getCategoriesForWord(wordId)
  return result.ok ? result.data : []
}

export async function createCategory(input: CategoryInput): Promise<Category | null> {
  const result = await categoriesDb.createCategory(input)
  return result.ok ? result.data : null
}

export async function updateCategory(id: string, update: CategoryUpdate): Promise<Category | null> {
  const result = await categoriesDb.updateCategory(id, update)
  return result.ok ? result.data : null
}

export async function deleteCategory(id: string): Promise<boolean> {
  const result = await categoriesDb.deleteCategory(id)
  return result.ok
}

export async function assignCategoryToWord(wordId: string, categoryId: string): Promise<boolean> {
  const result = await categoriesDb.assignCategoryToWord(wordId, categoryId)
  return result.ok
}

export async function unassignCategoryFromWord(wordId: string, categoryId: string): Promise<boolean> {
  const result = await categoriesDb.unassignCategoryFromWord(wordId, categoryId)
  return result.ok
}

export async function assignCategoryToWords(wordIds: string[], categoryId: string): Promise<boolean> {
  const result = await categoriesDb.assignCategoryToWords(wordIds, categoryId)
  return result.ok
}

export async function unassignCategoryFromWords(wordIds: string[], categoryId: string): Promise<boolean> {
  const result = await categoriesDb.unassignCategoryFromWords(wordIds, categoryId)
  return result.ok
}

// 新建单词自动归入默认分类（§6.1）：无默认分类则 no-op。
export async function assignDefaultToWord(wordId: string): Promise<void> {
  const result = await categoriesDb.getDefaultCategory()
  if (!result.ok || !result.data) return
  await categoriesDb.assignCategoryToWord(wordId, result.data.id)
}

/** `location` 传入时只取该模块的词（v0.7.5 Task 12：复习分类计数只算工作区）。 */
export async function getWordCategoryMap(location?: WordLocation): Promise<Record<string, string[]>> {
  const result = await categoriesDb.getAllWordCategoryMap(location)
  return result.ok ? result.data : {}
}
