import { getDb } from './connection'
import type { Category, CategoryInput, CategoryUpdate } from '../types/category'
import type { DbResult } from './types'

function mapCategoryRow(r: Record<string, any>): Category {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    description: r.description ?? undefined,
    isDefault: !!r.is_default,
  }
}

export async function getAllCategories(): Promise<DbResult<Category[]>> {
  try {
    const rows = await getDb().select<Record<string, any>[]>(
      'SELECT * FROM categories ORDER BY created_at ASC'
    )
    return { ok: true, data: rows.map(mapCategoryRow) }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

export async function getCategoriesForWord(wordId: string): Promise<DbResult<Category[]>> {
  try {
    const rows = await getDb().select<Record<string, any>[]>(
      `SELECT c.* FROM categories c
       JOIN word_categories wc ON wc.category_id = c.id
       WHERE wc.word_id = ?1
       ORDER BY c.created_at ASC`,
      [wordId]
    )
    return { ok: true, data: rows.map(mapCategoryRow) }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

export async function getDefaultCategory(): Promise<DbResult<Category | null>> {
  try {
    const rows = await getDb().select<Record<string, any>[]>(
      'SELECT * FROM categories WHERE is_default = 1 LIMIT 1'
    )
    if (rows.length === 0) return { ok: true, data: null }
    return { ok: true, data: mapCategoryRow(rows[0]) }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

export async function createCategory(input: CategoryInput): Promise<DbResult<Category>> {
  try {
    const id = crypto.randomUUID()
    const now = Date.now()
    if (input.isDefault) {
      await getDb().execute('UPDATE categories SET is_default = 0')
    }
    await getDb().execute(
      `INSERT INTO categories (id, name, color, description, is_default, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`,
      [id, input.name, input.color, input.description ?? null, input.isDefault ? 1 : 0, now]
    )
    return {
      ok: true,
      data: {
        id,
        name: input.name,
        color: input.color,
        description: input.description,
        isDefault: !!input.isDefault,
      },
    }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

export async function updateCategory(id: string, update: CategoryUpdate): Promise<DbResult<Category>> {
  try {
    const sets: string[] = []
    const params: unknown[] = []
    if (update.name !== undefined) { sets.push(`name = ?${params.length + 1}`); params.push(update.name) }
    if (update.color !== undefined) { sets.push(`color = ?${params.length + 1}`); params.push(update.color) }
    if (update.description !== undefined) { sets.push(`description = ?${params.length + 1}`); params.push(update.description) }
    if (update.isDefault !== undefined) {
      if (update.isDefault) await getDb().execute('UPDATE categories SET is_default = 0')
      sets.push(`is_default = ?${params.length + 1}`); params.push(update.isDefault ? 1 : 0)
    }
    if (sets.length === 0) return { ok: false, error: 'no fields to update' }
    sets.push(`updated_at = ?${params.length + 1}`)
    params.push(Date.now())
    params.push(id)
    await getDb().execute(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?${params.length}`, params)
    const rows = await getDb().select<Record<string, any>[]>(
      'SELECT * FROM categories WHERE id = ?1', [id]
    )
    if (rows.length === 0) return { ok: false, error: `category not found: ${id}` }
    return { ok: true, data: mapCategoryRow(rows[0]) }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

// 删除分类：先解除所有单词的关联（word_categories 行），再删分类，单词保留（规格 §6.4）。
export async function deleteCategory(id: string): Promise<DbResult<void>> {
  try {
    await getDb().execute('DELETE FROM word_categories WHERE category_id = ?1', [id])
    await getDb().execute('DELETE FROM categories WHERE id = ?1', [id])
    return { ok: true, data: undefined }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

export async function assignCategoryToWord(wordId: string, categoryId: string): Promise<DbResult<void>> {
  try {
    await getDb().execute(
      'INSERT OR IGNORE INTO word_categories (word_id, category_id) VALUES (?1, ?2)',
      [wordId, categoryId]
    )
    return { ok: true, data: undefined }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

export async function unassignCategoryFromWord(wordId: string, categoryId: string): Promise<DbResult<void>> {
  try {
    await getDb().execute(
      'DELETE FROM word_categories WHERE word_id = ?1 AND category_id = ?2',
      [wordId, categoryId]
    )
    return { ok: true, data: undefined }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

// 全量 word_id → category_ids 映射（侧边栏分类分组 / 列表项胶囊用）
export async function getAllWordCategoryMap(): Promise<DbResult<Record<string, string[]>>> {
  try {
    const rows = await getDb().select<{ word_id: string; category_id: string }[]>(
      'SELECT word_id, category_id FROM word_categories'
    )
    const map: Record<string, string[]> = {}
    for (const r of rows) {
      if (!map[r.word_id]) map[r.word_id] = []
      map[r.word_id].push(r.category_id)
    }
    return { ok: true, data: map }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

// SQLite 的变量上限是 999；每批 200 个 word_id（归入时还要一个 categoryId）留足余量。
const BATCH_SIZE = 200

/** 批量归入：底层是 INSERT OR IGNORE，与单条版共用同一条幂等语义。 */
export async function assignCategoryToWords(wordIds: string[], categoryId: string): Promise<DbResult<void>> {
  try {
    for (let i = 0; i < wordIds.length; i += BATCH_SIZE) {
      const batch = wordIds.slice(i, i + BATCH_SIZE)
      const holders = batch.map((_, j) => `(?${j * 2 + 1}, ?${j * 2 + 2})`).join(', ')
      await getDb().execute(
        `INSERT OR IGNORE INTO word_categories (word_id, category_id) VALUES ${holders}`,
        batch.flatMap(id => [id, categoryId]),
      )
    }
    return { ok: true, data: undefined }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

/** 批量移出：只删目标分类的关联，其它分类不受影响。 */
export async function unassignCategoryFromWords(wordIds: string[], categoryId: string): Promise<DbResult<void>> {
  try {
    for (let i = 0; i < wordIds.length; i += BATCH_SIZE) {
      const batch = wordIds.slice(i, i + BATCH_SIZE)
      const holders = batch.map((_, j) => `?${j + 2}`).join(', ')
      await getDb().execute(
        `DELETE FROM word_categories WHERE category_id = ?1 AND word_id IN (${holders})`,
        [categoryId, ...batch],
      )
    }
    return { ok: true, data: undefined }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}
