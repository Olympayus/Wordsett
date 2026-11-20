// src/services/exportService.ts
import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { getDb } from '../db/connection'
import { encodeLibrary, type LibrarySnapshot } from '../lib/libraryCodec'
import pkg from '../../package.json'

async function readSnapshot(): Promise<LibrarySnapshot> {
  const db = getDb()
  const q = (sql: string) => db.select<any[]>(sql)
  // v0.7.5 Task 15：导出带 location，备份恢复才不会把储藏库词条静默落回工作台。
  const words = await q(`SELECT id, lemma, normalized_lemma AS normalizedLemma, language, location, created_at AS createdAt, updated_at AS updatedAt FROM words`)
  // 只导出「自定义字段」：内置字段 id 固定为 f_<key>
  const fieldDefinitions = (await q(`SELECT id, name, key, field_type AS fieldType, display_order AS displayOrder, created_at AS createdAt FROM field_definitions`))
    .filter((d: any) => !d.id.startsWith('f_'))
  const fieldValues = await q(`SELECT id, word_id AS wordId, field_id AS fieldId, value, source, edited, original_value AS originalValue, display_order AS displayOrder, parent_id AS parentId, created_at AS createdAt, updated_at AS updatedAt FROM field_values`)
  const categories = await q(`SELECT id, name, color, description, is_default AS isDefault, created_at AS createdAt, updated_at AS updatedAt FROM categories`)
  const wordCategories = await q(`SELECT word_id AS wordId, category_id AS categoryId FROM word_categories`)
  return { words, fieldDefinitions, fieldValues, categories, wordCategories }
}

/**
 * 导出词库。
 *
 * `opts.documentsFallback`（v0.8.0 iOS）：iOS 的保存对话框把文件拷进沙盒后，
 * 返回的路径仍可能不可写（save-picker 的目标在沙盒外）。此时改走 Rust 的
 * `export_backup_to_documents`，确定性地写进应用自己的 Documents 目录
 * （Info.ios.plist 已开 UIFileSharingEnabled，用户可在「文件」App 的 Wordsett 下看到）。
 *
 * 服务保持平台无关：由调用点（`DataSettings`）按 `isIOS(platform)` 传这个开关。
 * 不传时行为与旧版逐字相同——桌面 / Android 的写入失败仍然如实报错。
 */
export async function exportLibrary(opts?: { documentsFallback?: boolean }): Promise<{ ok: boolean; error?: string; path?: string }> {
  const fileName = `wordsett-backup-v${pkg.version}.json`
  try {
    const path = await save({
      defaultPath: fileName,
      filters: [{ name: 'Wordsett 备份', extensions: ['json'] }],
    })
    if (!path) return { ok: false } // 用户取消
    const snapshot = await readSnapshot()
    const json = encodeLibrary(snapshot, pkg.version)
    try {
      await writeTextFile(path, json)
      return { ok: true, path }
    } catch (e) {
      if (!opts?.documentsFallback) throw e
      // 只在「写入选中的目标」失败时兜底：读快照 / 编码失败是另一类问题，
      // 换目录再写一次也救不回来，交给外层如实报错。
      const savedPath = await invoke<string>('export_backup_to_documents', { fileName, content: json })
      return { ok: true, path: savedPath }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
