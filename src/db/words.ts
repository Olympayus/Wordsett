import { getDb } from './connection'
import type { Word, WordWithPreview, CreateWordInput } from '../types/word'
import type { DbResult } from './types'

export async function createWord(input: CreateWordInput): Promise<DbResult<Word>> {
  try {
    const db = getDb()
    const id = crypto.randomUUID()
    const now = Date.now()
    const normalized = input.lemma.toLowerCase().trim()
    await db.execute(
      `INSERT INTO words (id, lemma, normalized_lemma, language, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)`,
      [id, input.lemma, normalized, input.language || 'en', now]
    )
    return { ok: true, data: { id, lemma: input.lemma, normalizedLemma: normalized, language: input.language || 'en', createdAt: now, updatedAt: now } }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

export async function getAllWords(): Promise<DbResult<Word[]>> {
  try {
    const rows = await getDb().select<Record<string, any>[]>('SELECT * FROM words ORDER BY updated_at DESC')
    return {
      ok: true,
      data: rows.map(r => ({
        id: r.id,
        lemma: r.lemma,
        normalizedLemma: r.normalized_lemma,
        language: r.language,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

// Shared preview query: single implementation for "all words" and "filtered".
// (Deduplicates the former duplicate in src/lib/search.ts vocabularySearch.)
async function queryWordPreviews(filter: string | null): Promise<WordWithPreview[]> {
  const db = getDb()
  const fieldDefs = await db.select<{ id: string; key: string }[]>(
    `SELECT id, key FROM field_definitions WHERE key IN ('part_of_speech', 'phonetic')`
  )
  const defMap = new Map<string, string>()
  fieldDefs.forEach(fd => defMap.set(fd.key, fd.id))
  const posId = defMap.get('part_of_speech')
  const phoneticId = defMap.get('phonetic')

  const filterParam = filter ? `%${filter}%` : null
  // 预览：音标取首条；词性聚合该词全部 value（按 displayOrder 序去重，| 分隔），映射为 partOfSpeechTags。
  // 不再取首中文释义（④ 已从侧边栏移除展示）；筛选仍走 field_values.value，不受影响。
  const rows = await db.select<Record<string, any>[]>(
    `SELECT w.*,
            MAX(CASE WHEN fv.field_id = ?1 AND fv.rn = 1 THEN fv.value END) as phonetic,
            (SELECT GROUP_CONCAT(value, '|') FROM (
               SELECT DISTINCT fv3.value
               FROM field_values fv3
               WHERE fv3.word_id = w.id AND fv3.field_id = ?2
               GROUP BY fv3.value ORDER BY MIN(fv3.display_order)
             )) as pos_values
     FROM words w
     LEFT JOIN (
       SELECT fv2.*, ROW_NUMBER() OVER (PARTITION BY fv2.word_id, fv2.field_id ORDER BY fv2.display_order, fv2.id) AS rn
       FROM field_values fv2
     ) fv ON fv.word_id = w.id
     ${filterParam ? `WHERE w.lemma LIKE ?3 OR (?4 <> '' AND fv.field_id = ?4 AND fv.value LIKE ?3) OR (?5 <> '' AND fv.field_id = ?5 AND fv.value LIKE ?3)` : ''}
     GROUP BY w.id
     ORDER BY w.updated_at DESC`,
    filterParam
      ? [phoneticId || '', posId || '', filterParam, phoneticId || '', posId || '']
      : [phoneticId || '', posId || '']
  )
  return rows.map(r => ({
    id: r.id,
    lemma: r.lemma,
    normalizedLemma: r.normalized_lemma,
    language: r.language,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    phonetic: r.phonetic || undefined,
    partOfSpeechTags: r.pos_values ? r.pos_values.split('|') : [],
  }))
}

export async function getWordsWithPreviews(): Promise<DbResult<WordWithPreview[]>> {
  try {
    const data = await queryWordPreviews(null)
    return { ok: true, data }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

export async function searchWords(query: string): Promise<DbResult<WordWithPreview[]>> {
  try {
    const filter = query.trim() ? query.toLowerCase().trim() : null
    const data = await queryWordPreviews(filter)
    return { ok: true, data }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

export async function getWordByLemma(lemma: string): Promise<DbResult<Word | null>> {
  try {
    const rows = await getDb().select<Record<string, any>[]>(
      'SELECT * FROM words WHERE normalized_lemma = ?1 LIMIT 1', [lemma.toLowerCase().trim()]
    )
    if (rows.length === 0) return { ok: true, data: null }
    const r = rows[0]
    return {
      ok: true,
      data: {
        id: r.id,
        lemma: r.lemma,
        normalizedLemma: r.normalized_lemma,
        language: r.language,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      },
    }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

export async function deleteWord(id: string): Promise<DbResult<void>> {
  try {
    await getDb().execute('DELETE FROM words WHERE id = ?1', [id])
    return { ok: true, data: undefined }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}
