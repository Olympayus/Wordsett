import { getDb } from './connection'
import type { Word, WordWithPreview, CreateWordInput, WordLocation } from '../types/word'
import type { DbResult } from './types'

/** words 行 → Word。三处 SELECT * 读取共用，避免漏带 `location`（schema v7 起 NOT NULL）。 */
function mapWordRow(r: Record<string, any>): Word {
  return {
    id: r.id,
    lemma: r.lemma,
    normalizedLemma: r.normalized_lemma,
    language: r.language,
    location: r.location as WordLocation,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

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
    // location 不写入，走建表默认值 'workspace'；返回对象与库中行保持一致。
    return { ok: true, data: { id, lemma: input.lemma, normalizedLemma: normalized, language: input.language || 'en', location: 'workspace', createdAt: now, updatedAt: now } }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

export async function getAllWords(): Promise<DbResult<Word[]>> {
  try {
    const rows = await getDb().select<Record<string, any>[]>('SELECT * FROM words ORDER BY updated_at DESC')
    return { ok: true, data: rows.map(mapWordRow) }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

// Shared preview query: single implementation for "all words" and "filtered".
// (Deduplicates the former duplicate in src/lib/search.ts vocabularySearch.)
// `location` 为 null 表示**不限模块**：全库搜索（searchWords）沿用旧语义，不吃视图过滤；
// 侧栏词表（getWordsByLocation / getWordsWithPreviews）传具体模块。
async function queryWordPreviews(location: WordLocation | null, filter: string | null): Promise<WordWithPreview[]> {
  const db = getDb()
  const fieldDefs = await db.select<{ id: string; key: string }[]>(
    `SELECT id, key FROM field_definitions WHERE key IN ('part_of_speech', 'phonetic')`
  )
  const defMap = new Map<string, string>()
  fieldDefs.forEach(fd => defMap.set(fd.key, fd.id))
  const posId = defMap.get('part_of_speech')
  const phoneticId = defMap.get('phonetic')

  const filterParam = filter ? `%${filter}%` : null
  // 占位符按实际入参位置动态编号：location 与 filter 各自可缺省，写死 ?3–?5 会在
  // 只有其中一个条件时错位。
  const params: unknown[] = [phoneticId || '', posId || '']
  const where: string[] = []
  if (location) {
    params.push(location)
    where.push(`w.location = ?${params.length}`)
  }
  if (filterParam) {
    params.push(filterParam)
    const q = params.length
    params.push(phoneticId || '')
    const phonetic = params.length
    params.push(posId || '')
    const pos = params.length
    where.push(
      `(w.lemma LIKE ?${q} OR (?${phonetic} <> '' AND fv.field_id = ?${phonetic} AND fv.value LIKE ?${q})` +
      ` OR (?${pos} <> '' AND fv.field_id = ?${pos} AND fv.value LIKE ?${q}))`
    )
  }

  // 预览：音标取首条；词性聚合该词全部 value（按 displayOrder 序去重，| 分隔），映射为 partOfSpeechTags。
  // 不再取首中文释义（④ 已从侧边栏移除展示）；筛选仍走 field_values.value，不受影响。
  // `w.*` 已含 location（schema v7），行映射经 mapWordRow 带出。
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
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     GROUP BY w.id
     ORDER BY w.updated_at DESC`,
    params
  )
  return rows.map(r => ({
    ...mapWordRow(r),
    phonetic: r.phonetic || undefined,
    partOfSpeechTags: r.pos_values ? r.pos_values.split('|') : [],
  }))
}

/** 旧入口（v0.7.5 前即存在）：语义固定为**工作区**，保留函数名以免改动既有调用点。 */
export async function getWordsWithPreviews(): Promise<DbResult<WordWithPreview[]>> {
  return getWordsByLocation('workspace')
}

/** 按库模块取侧栏预览（工作区 / 储藏库）。 */
export async function getWordsByLocation(location: WordLocation): Promise<DbResult<WordWithPreview[]>> {
  try {
    const data = await queryWordPreviews(location, null)
    return { ok: true, data }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

export async function searchWords(query: string): Promise<DbResult<WordWithPreview[]>> {
  try {
    const filter = query.trim() ? query.toLowerCase().trim() : null
    // 全库搜索：与 v0.7.5 之前一致，不做模块过滤（WordList 依赖这一点）。
    const data = await queryWordPreviews(null, filter)
    return { ok: true, data }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

/** 移动词条到工作区 / 储藏库。复习卡与历史不动——位置只是复习侧的可见性门槛。 */
export async function setWordLocation(wordId: string, location: WordLocation): Promise<DbResult<void>> {
  try {
    await getDb().execute(
      'UPDATE words SET location = ?1, updated_at = ?2 WHERE id = ?3',
      [location, Date.now(), wordId]
    )
    return { ok: true, data: undefined }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

/** 词库三档计数：总数 / 工作区 / 储藏库（侧栏模块徽标与设置页共用）。 */
export async function getLocationCounts(): Promise<DbResult<{ total: number; workspace: number; archive: number }>> {
  try {
    const rows = await getDb().select<Record<string, any>>(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN location = 'workspace' THEN 1 ELSE 0 END), 0) AS workspace,
              COALESCE(SUM(CASE WHEN location = 'archive' THEN 1 ELSE 0 END), 0) AS archive
         FROM words`
    )
    const r = rows[0] ?? {}
    return {
      ok: true,
      data: {
        total: Number(r.total ?? 0),
        workspace: Number(r.workspace ?? 0),
        archive: Number(r.archive ?? 0),
      },
    }
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
    return { ok: true, data: mapWordRow(rows[0]) }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

/** 删除单个词条。字段、分类关联、复习卡的清理由外键 `ON DELETE CASCADE` 负责，
 *  而级联**需要 `PRAGMA foreign_keys = ON` 才会生效——生产当前没有开启它**，
 *  全仓唯一开着的只有测试适配器（`src/db/test-utils.ts:13`）。
 *  故此处的实际效果是只删 `words` 一行，`field_values` / `word_categories` /
 *  `review_cards` / `review_states` / `review_logs` 会留下孤儿行。
 *  批量版 `deleteWords` 同理。 */
export async function deleteWord(id: string): Promise<DbResult<void>> {
  try {
    await getDb().execute('DELETE FROM words WHERE id = ?1', [id])
    return { ok: true, data: undefined }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

// 与 categories 同一档分批：SQLite 变量上限 999，取 200 留足余量。
const DELETE_BATCH_SIZE = 200

/** 批量删除词条；字段、分类关联、复习卡的清理由外键 `ON DELETE CASCADE` 负责，需
 *  `foreign_keys` 开启（生产当前未开启，见 src/db/test-utils.ts:13），故实际只删
 *  `words` 这些行，其余关联表会留下孤儿行。 */
export async function deleteWords(ids: string[]): Promise<DbResult<void>> {
  try {
    for (let i = 0; i < ids.length; i += DELETE_BATCH_SIZE) {
      const batch = ids.slice(i, i + DELETE_BATCH_SIZE)
      const holders = batch.map((_, j) => `?${j + 1}`).join(', ')
      await getDb().execute(`DELETE FROM words WHERE id IN (${holders})`, batch)
    }
    return { ok: true, data: undefined }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}
