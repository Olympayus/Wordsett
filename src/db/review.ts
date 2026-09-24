import { getDb } from './connection'
import type { DbHandle } from './init'
import type { DbResult } from './types'
import { FIELD_KEY_GROUPS, usableTemplates, type FieldMask, type TemplateLog } from '../lib/review/template'
import type { CardContent, InitialFamiliarity, Template } from '../lib/review/types'
import type { QueueCandidate } from '../lib/review/queue'

const db = (h?: DbHandle): DbHandle => (h ?? (getDb() as unknown as DbHandle))

/** 惰性注册：候选词补一张卡（一词一卡，UNIQUE 索引防重）。 */
export async function registerCards(wordIds: string[], h?: DbHandle): Promise<void> {
  if (wordIds.length === 0) return
  const d = db(h)
  const now = Date.now()
  for (const wordId of wordIds) {
    await d.execute(
      'INSERT OR IGNORE INTO review_cards (id, word_id, last_template, created_at) VALUES (?1, ?2, NULL, ?3)',
      [crypto.randomUUID(), wordId, now],
    )
  }
}

/** 一次查询出全量字段可用掩码（布尔值，不含内容）。 */
export async function getAvailabilityMask(
  wordIds: string[],
  h?: DbHandle,
): Promise<DbResult<Record<string, FieldMask>>> {
  if (wordIds.length === 0) return { ok: true, data: {} }
  const d = db(h)
  try {
    const placeholders = wordIds.map((_, i) => `?${i + 1}`).join(',')
    const groups = Object.entries(FIELD_KEY_GROUPS) as [keyof FieldMask, string[]][]
    const selects = groups
      .map(([group, keys]) => {
        const keyList = keys.map(k => `'${k}'`).join(',')
        return `EXISTS(SELECT 1 FROM field_values fv JOIN field_definitions fd ON fd.id = fv.field_id
                       WHERE fv.word_id = w.id AND fd.key IN (${keyList})) AS ${group}`
      })
      .join(',\n  ')
    const rows = await d.select<Record<string, number>>(
      `SELECT w.id AS word_id, ${selects} FROM words w WHERE w.id IN (${placeholders})`,
      wordIds,
    )
    const out: Record<string, FieldMask> = {}
    for (const row of rows) {
      const id = row.word_id as unknown as string
      out[id] = {
        translation: !!row.translation,
        definition: !!row.definition,
        example: !!row.example,
        phonetic: !!row.phonetic,
      }
    }
    return { ok: true, data: out }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

/** 行 → QueueCandidate（stability 空 = 新卡未首评；dueAt 空 = 新卡无意义取 0）。 */
function mapCandidate(r: Record<string, any>, mask: Record<string, FieldMask>): QueueCandidate {
  const m = mask[r.word_id] ?? { translation: false, definition: false, example: false, phonetic: false }
  const fam = Number(r.initial_familiarity)
  return {
    cardId: r.card_id,
    wordId: r.word_id,
    stability: r.stability === null || r.stability === undefined ? null : Number(r.stability),
    dueAt: r.due_at === null || r.due_at === undefined ? 0 : Number(r.due_at),
    lastReviewAt: r.last_review_at === null || r.last_review_at === undefined ? null : Number(r.last_review_at),
    initialFamiliarity: (fam === 2 || fam === 3 ? fam : 1) as InitialFamiliarity,
    availableTemplates: usableTemplates(m),
  }
}

/** 候选池：到期卡 + 未首评新卡，带字段掩码与可用模板。suspended 卡排除在外。 */
export async function getCandidates(now: number, h?: DbHandle): Promise<DbResult<QueueCandidate[]>> {
  const d = db(h)
  try {
    const rows = await d.select<Record<string, any>>(
      `SELECT c.id AS card_id, c.word_id,
              s.stability, s.due_at, s.last_review_at,
              c.initial_familiarity
       FROM review_cards c
       LEFT JOIN review_states s ON s.card_id = c.id
       WHERE s.card_id IS NULL OR (s.suspended = 0 AND s.due_at <= ?1)`,
      [now],
    )
    const mask = await getAvailabilityMask(rows.map(r => r.word_id), d)
    if (!mask.ok) return mask
    return { ok: true, data: rows.map(r => mapCandidate(r, mask.data)) }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

/** 自由练习用：全部未挂起卡（含未到期的熟词），dueAt 原样带出。 */
export async function getAllCandidates(h?: DbHandle): Promise<DbResult<QueueCandidate[]>> {
  const d = db(h)
  try {
    const rows = await d.select<Record<string, any>>(
      `SELECT c.id AS card_id, c.word_id,
              s.stability, s.due_at, s.last_review_at,
              c.initial_familiarity
       FROM review_cards c
       LEFT JOIN review_states s ON s.card_id = c.id
       WHERE s.card_id IS NULL OR s.suspended = 0`,
    )
    const mask = await getAvailabilityMask(rows.map(r => r.word_id), d)
    if (!mask.ok) return mask
    return { ok: true, data: rows.map(r => mapCandidate(r, mask.data)) }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

/** 按卡分组的出题日志（含 practice），供 pickTemplate 使用。 */
export async function getTemplateLogs(
  cardIds: string[],
  h?: DbHandle,
): Promise<DbResult<Record<string, TemplateLog[]>>> {
  if (cardIds.length === 0) return { ok: true, data: {} }
  const d = db(h)
  try {
    const placeholders = cardIds.map((_, i) => `?${i + 1}`).join(',')
    const rows = await d.select<Record<string, any>>(
      `SELECT card_id, template, rating FROM review_logs
       WHERE card_id IN (${placeholders}) AND template IS NOT NULL
       ORDER BY reviewed_at ASC`,
      cardIds,
    )
    const out: Record<string, TemplateLog[]> = {}
    for (const r of rows) {
      const list = out[r.card_id] ?? (out[r.card_id] = [])
      list.push({ template: r.template as Template, rating: Number(r.rating) })
    }
    return { ok: true, data: out }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

/** 卡的元信息：上次出题模板（轮换的防重复输入）。 */
export async function getCardMeta(
  cardId: string,
  h?: DbHandle,
): Promise<DbResult<{ cardId: string; wordId: string; lastTemplate: Template | null } | null>> {
  const d = db(h)
  try {
    const rows = await d.select<Record<string, any>>(
      'SELECT id, word_id, last_template FROM review_cards WHERE id = ?1', [cardId])
    if (rows.length === 0) return { ok: true, data: null }
    const r = rows[0]
    return {
      ok: true,
      data: {
        cardId: r.id,
        wordId: r.word_id,
        lastTemplate: (r.last_template ?? null) as Template | null,
      },
    }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

/** 取词条出题所需内容（lemma / 音标 / 词性 / 中英释义 / 例句）。词不存在返回 null。 */
export async function getWordContent(wordId: string, h?: DbHandle): Promise<CardContent | null> {
  const d = db(h)
  const rows = await d.select<Record<string, any>>(
    `SELECT w.lemma,
       (SELECT fv.value FROM field_values fv JOIN field_definitions fd ON fd.id = fv.field_id
          WHERE fv.word_id = w.id AND fd.key = 'phonetic' ORDER BY fv.display_order LIMIT 1) AS phonetic,
       (SELECT fv.value FROM field_values fv JOIN field_definitions fd ON fd.id = fv.field_id
          WHERE fv.word_id = w.id AND fd.key = 'part_of_speech' ORDER BY fv.display_order LIMIT 1) AS part_of_speech,
       (SELECT fv.value FROM field_values fv JOIN field_definitions fd ON fd.id = fv.field_id
          WHERE fv.word_id = w.id AND fd.key = 'chinese_definition' ORDER BY fv.display_order LIMIT 1) AS translation,
       (SELECT fv.value FROM field_values fv JOIN field_definitions fd ON fd.id = fv.field_id
          WHERE fv.word_id = w.id AND fd.key = 'english_definition' ORDER BY fv.display_order LIMIT 1) AS definition,
       (SELECT fv.value FROM field_values fv JOIN field_definitions fd ON fd.id = fv.field_id
          WHERE fv.word_id = w.id AND fd.key IN ('example_sentence','example') ORDER BY fv.display_order LIMIT 1) AS example
     FROM words w WHERE w.id = ?1`,
    [wordId],
  )
  if (rows.length === 0) return null
  const r = rows[0]
  return {
    lemma: r.lemma ?? '',
    phonetic: r.phonetic ?? '',
    partOfSpeech: r.part_of_speech ?? '',
    translation: r.translation ?? '',
    definition: r.definition ?? '',
    example: r.example ?? '',
    distractors: await getDistractorTranslations(wordId, 3, d),
  }
}

/** 跨词采样干扰释义：只 SELECT 释义文本，不含任何其他字段。 */
export async function getDistractorTranslations(wordId: string, n: number, h?: DbHandle): Promise<string[]> {
  const d = db(h)
  const rows = await d.select<Record<string, any>>(
    `SELECT DISTINCT fv.value FROM field_values fv
     JOIN field_definitions fd ON fd.id = fv.field_id
     WHERE fd.key = 'chinese_definition' AND fv.word_id <> ?1
       AND fv.value IS NOT NULL AND trim(fv.value) <> ''
     ORDER BY fv.word_id LIMIT ?2`,
    [wordId, n],
  )
  return rows.map(r => String(r.value))
}
