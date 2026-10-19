// src/lib/libraryCodec.ts
import type { WordLocation } from '../types/word'

export interface WordRow {
  id: string; lemma: string; normalizedLemma: string; language: string;
  /**
   * 词条所在模块（v0.7.5 Task 15）。**可选**：FORMAT_VERSION 仍是 1——加字段是兼容扩展，
   * 老备份没有这一栏，导入时由 `applyImport` 统一回落 `'workspace'`（当时全库只有工作区）。
   */
  location?: WordLocation
  createdAt: number; updatedAt: number
}
export interface FieldDefRow {
  id: string; name: string; key: string; fieldType: string;
  displayOrder: number; createdAt: number
}
export interface FieldValueRow {
  id: string; wordId: string; fieldId: string; value: string | null;
  source: string; edited: boolean; originalValue: string | null;
  displayOrder: number; parentId: string | null; createdAt: number; updatedAt: number
}
export interface CategoryRow {
  id: string; name: string; color: string; description: string | null;
  isDefault: boolean; createdAt: number; updatedAt: number
}
export interface WordCategoryRow { wordId: string; categoryId: string }

export interface LibrarySnapshot {
  words: WordRow[]
  fieldDefinitions: FieldDefRow[]
  fieldValues: FieldValueRow[]
  categories: CategoryRow[]
  wordCategories: WordCategoryRow[]
}

export const FORMAT_VERSION = 1

export interface ImportPlan {
  newWords: number
  updatedWords: number
  newCategories: number
  updatedCategories: number
  newFieldDefinitions: number
  updatedFieldDefinitions: number
  newFieldValues: number
  updatedFieldValues: number
  newWordCategories: number
  skipped: number
  errors: string[]
}

export function encodeLibrary(snapshot: LibrarySnapshot, appVersion: string): string {
  return JSON.stringify(
    { formatVersion: FORMAT_VERSION, appVersion, exportedAt: Date.now(), ...snapshot },
    null, 2
  )
}

export function decodeLibrary(json: string): LibrarySnapshot {
  const parsed = JSON.parse(json) as Partial<LibrarySnapshot> & { formatVersion?: number }
  if (parsed.formatVersion !== FORMAT_VERSION) {
    throw new Error(`不支持的词库文件版本 formatVersion=${String(parsed.formatVersion)}（期望 ${FORMAT_VERSION}）`)
  }
  return {
    words: parsed.words ?? [],
    fieldDefinitions: parsed.fieldDefinitions ?? [],
    fieldValues: parsed.fieldValues ?? [],
    categories: parsed.categories ?? [],
    wordCategories: parsed.wordCategories ?? [],
  }
}

// 合并规划：同 id 行比对 updatedAt 保留新者；无 id 冲突即新增。
// 泛型：每行需有 id（wordCategories 除外，按复合键）。
// 时间戳比较由调用方注入：field_definitions 无 updated_at 列，同 id 一律按重复跳过。
function planRows<T extends { id: string }>(
  existing: T[], incoming: T[],
  getUpdatedAt: (row: T) => number
): { news: number; updates: number; skipped: number } {
  const byId = new Map(existing.map(r => [r.id, r]))
  let news = 0, updates = 0, skipped = 0
  for (const row of incoming) {
    const cur = byId.get(row.id)
    if (!cur) { news++; continue }
    if (getUpdatedAt(row) > getUpdatedAt(cur)) updates++
    else skipped++
  }
  return { news, updates, skipped }
}

export function planImport(existing: LibrarySnapshot, incoming: LibrarySnapshot): ImportPlan {
  const w = planRows(existing.words, incoming.words, r => r.updatedAt)
  const c = planRows(existing.categories, incoming.categories, r => r.updatedAt)
  const f = planRows(existing.fieldValues, incoming.fieldValues, r => r.updatedAt)
  // field_definitions 无 updated_at：同 id 即重复，跳过保留现有
  const fd = planRows(existing.fieldDefinitions, incoming.fieldDefinitions, () => 0)

  const wcSet = new Set(existing.wordCategories.map(wc => `${wc.wordId}||${wc.categoryId}`))
  let newWordCategories = 0
  for (const wc of incoming.wordCategories) {
    const k = `${wc.wordId}||${wc.categoryId}`
    if (!wcSet.has(k)) { newWordCategories++; wcSet.add(k) }
  }

  return {
    newWords: w.news, updatedWords: w.updates,
    newCategories: c.news, updatedCategories: c.updates,
    newFieldDefinitions: fd.news, updatedFieldDefinitions: fd.updates,
    newFieldValues: f.news, updatedFieldValues: f.updates,
    newWordCategories,
    skipped: w.skipped + c.skipped + f.skipped + fd.skipped,
    errors: [],
  }
}
