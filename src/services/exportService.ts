// src/services/exportService.ts
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { getDb } from '../db/connection'
import { encodeLibrary, type LibrarySnapshot } from '../lib/libraryCodec'
import pkg from '../../package.json'

async function readSnapshot(): Promise<LibrarySnapshot> {
  const db = getDb()
  const q = (sql: string) => db.select<any[]>(sql)
  const words = await q(`SELECT id, lemma, normalized_lemma AS normalizedLemma, language, created_at AS createdAt, updated_at AS updatedAt FROM words`)
  // 只导出「自定义字段」：内置字段 id 固定为 f_<key>
  const fieldDefinitions = (await q(`SELECT id, name, key, field_type AS fieldType, display_order AS displayOrder, created_at AS createdAt FROM field_definitions`))
    .filter((d: any) => !d.id.startsWith('f_'))
  const fieldValues = await q(`SELECT id, word_id AS wordId, field_id AS fieldId, value, source, edited, original_value AS originalValue, display_order AS displayOrder, parent_id AS parentId, created_at AS createdAt, updated_at AS updatedAt FROM field_values`)
  const categories = await q(`SELECT id, name, color, description, is_default AS isDefault, created_at AS createdAt, updated_at AS updatedAt FROM categories`)
  const wordCategories = await q(`SELECT word_id AS wordId, category_id AS categoryId FROM word_categories`)
  return { words, fieldDefinitions, fieldValues, categories, wordCategories }
}

export async function exportLibrary(): Promise<{ ok: boolean; error?: string; path?: string }> {
  try {
    const path = await save({
      defaultPath: `wordsett-backup-v${pkg.version}.json`,
      filters: [{ name: 'Wordsett 备份', extensions: ['json'] }],
    })
    if (!path) return { ok: false } // 用户取消
    const snapshot = await readSnapshot()
    const json = encodeLibrary(snapshot, pkg.version)
    await writeTextFile(path, json)
    return { ok: true, path }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
