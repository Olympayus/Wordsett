// src/services/importService.ts
import { open } from '@tauri-apps/plugin-dialog'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { getDb } from '../db/connection'
import {
  decodeLibrary, planImport, type LibrarySnapshot, type ImportPlan,
} from '../lib/libraryCodec'

const mapRows = (rows: Record<string, any>[], map: Record<string, string>): any[] =>
  rows.map(r => Object.fromEntries(
    Object.entries(map).map(([from, to]) => [to, r[from]])
  ))

async function readCurrentSnapshot(): Promise<LibrarySnapshot> {
  const db = getDb()
  const q = (sql: string) => db.select<Record<string, any>[]>(sql)
  return {
    words: mapRows(await q(`SELECT * FROM words`), { id: 'id', lemma: 'lemma', normalized_lemma: 'normalizedLemma', language: 'language', created_at: 'createdAt', updated_at: 'updatedAt' }),
    // 仅自定义字段参与 dry-run 统计（内置字段按 key 重建，不计数）
    fieldDefinitions: mapRows(await q(`SELECT * FROM field_definitions`), { id: 'id', name: 'name', key: 'key', field_type: 'fieldType', display_order: 'displayOrder', created_at: 'createdAt' })
      .filter((d: any) => !d.id.startsWith('f_')),
    fieldValues: mapRows(await q(`SELECT * FROM field_values`), { id: 'id', word_id: 'wordId', field_id: 'fieldId', value: 'value', source: 'source', edited: 'edited', original_value: 'originalValue', display_order: 'displayOrder', parent_id: 'parentId', created_at: 'createdAt', updated_at: 'updatedAt' }),
    categories: mapRows(await q(`SELECT * FROM categories`), { id: 'id', name: 'name', color: 'color', description: 'description', is_default: 'isDefault', created_at: 'createdAt', updated_at: 'updatedAt' }),
    wordCategories: mapRows(await q(`SELECT * FROM word_categories`), { word_id: 'wordId', category_id: 'categoryId' }),
  }
}

export async function pickAndPlanImport(): Promise<{ ok: boolean; error?: string; plan?: ImportPlan; path?: string }> {
  try {
    const path = await open({ multiple: false, filters: [{ name: 'Wordsett 备份', extensions: ['json'] }] })
    if (!path) return { ok: false }
    const json = await readTextFile(path)
    const incoming = decodeLibrary(json)
    const plan = planImport(await readCurrentSnapshot(), incoming)
    return { ok: true, plan, path }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function applyImport(path: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const json = await readTextFile(path)
    const incoming = decodeLibrary(json)
    const db = getDb()
    // 注意：不用事务包裹。tauri-plugin-sql 的连接池会把同一批 db.execute 分散到不同连接，
    // BEGIN 与后续写入不在同一连接上会触发 SQLITE_BUSY（database is locked）。
    // 每行独立提交（已知限制：中途失败会留下部分合并结果，JS API 无连接固定的跨行事务）。
    // LWW：仅当 incoming.updatedAt 严格大于库内值才覆盖；否则保留库内新数据（对应 planImport 的 skipped）
    const upsertLww = (table: string, cols: string[], values: any[]) =>
      db.execute(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
         ON CONFLICT(id) DO UPDATE SET ${cols.filter(c => c !== 'id').map(c => `${c} = excluded.${c}`).join(', ')}
         WHERE excluded.updated_at > ${table}.updated_at`,
        values
      )
    // 无 updated_at 的表（field_definitions）：仅插入新 id，已存在跳过
    const upsertNewOnly = (table: string, cols: string[], values: any[]) =>
      db.execute(
        `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})
         ON CONFLICT(id) DO NOTHING`,
        values
      )
    // 依赖顺序：words/categories/fieldDefinitions 先，fieldValues 次（父 id 需已存在），word_categories 最后
    for (const w of incoming.words) await upsertLww('words', ['id', 'lemma', 'normalized_lemma', 'language', 'created_at', 'updated_at'], [w.id, w.lemma, w.normalizedLemma, w.language, w.createdAt, w.updatedAt])
    for (const c of incoming.categories) await upsertLww('categories', ['id', 'name', 'color', 'description', 'is_default', 'created_at', 'updated_at'], [c.id, c.name, c.color, c.description, c.isDefault, c.createdAt, c.updatedAt])
    for (const d of incoming.fieldDefinitions) await upsertNewOnly('field_definitions', ['id', 'name', 'key', 'field_type', 'display_order', 'created_at'], [d.id, d.name, d.key, d.fieldType, d.displayOrder, d.createdAt])
    for (const fv of incoming.fieldValues) await upsertLww('field_values', ['id', 'word_id', 'field_id', 'value', 'source', 'edited', 'original_value', 'display_order', 'parent_id', 'created_at', 'updated_at'], [fv.id, fv.wordId, fv.fieldId, fv.value, fv.source, fv.edited, fv.originalValue, fv.displayOrder, fv.parentId, fv.createdAt, fv.updatedAt])
    for (const wc of incoming.wordCategories) {
      await db.execute(
        `INSERT OR IGNORE INTO word_categories (word_id, category_id) VALUES ($1, $2)`,
        [wc.wordId, wc.categoryId]
      )
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
