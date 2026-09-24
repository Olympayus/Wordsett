import { getDb } from './connection'
import type { DbHandle } from './init'
import type { DbResult } from './types'
import { FIELD_KEY_GROUPS, usableTemplates, type FieldMask, type TemplateLog } from '../lib/review/template'
import { mastery as toMastery, masteryTier } from '../lib/review/mastery'
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

/**
 * 跨词采样干扰释义：只 SELECT 释义文本，不含任何其他字段。
 * 随机采样（`ORDER BY random()`）——顺序取前 n 个会让几乎每张认读卡都摆出同样的三个干扰项，
 * 用户可以靠「挑没见过的那个」蒙对。子查询先行去重，再随机排序截断。
 */
export async function getDistractorTranslations(wordId: string, n: number, h?: DbHandle): Promise<string[]> {
  const d = db(h)
  const rows = await d.select<Record<string, any>>(
    `SELECT value FROM (
       SELECT DISTINCT fv.value AS value FROM field_values fv
       JOIN field_definitions fd ON fd.id = fv.field_id
       WHERE fd.key = 'chinese_definition' AND fv.word_id <> ?1
         AND fv.value IS NOT NULL AND trim(fv.value) <> ''
     ) ORDER BY random() LIMIT ?2`,
    [wordId, n],
  )
  return rows.map(r => String(r.value))
}

/** 惰性注册：把库里全部词补一张卡（一词一卡，UNIQUE 索引防重）。 */
export async function registerAllWords(h?: DbHandle): Promise<void> {
  const d = db(h)
  const rows = await d.select<{ id: string }>('SELECT id FROM words')
  await registerCards(rows.map(r => r.id), d)
}

export interface ReviewStateRow {
  stability: number | null
  difficulty: number | null
  reps: number
  lapses: number
  lastReviewAt: number | null
}

/** 卡的计分状态；无状态行（未首评）返回 null。lastReviewAt 供 elapsedDays 计算。 */
export async function getState(cardId: string, h?: DbHandle): Promise<DbResult<ReviewStateRow | null>> {
  const d = db(h)
  try {
    const rows = await d.select<Record<string, any>>(
      'SELECT stability, difficulty, reps, lapses, last_review_at FROM review_states WHERE card_id = ?1', [cardId])
    if (rows.length === 0) return { ok: true, data: null }
    const r = rows[0]
    return {
      ok: true,
      data: {
        stability: r.stability === null || r.stability === undefined ? null : Number(r.stability),
        difficulty: r.difficulty === null || r.difficulty === undefined ? null : Number(r.difficulty),
        reps: Number(r.reps),
        lapses: Number(r.lapses),
        lastReviewAt: r.last_review_at === null || r.last_review_at === undefined ? null : Number(r.last_review_at),
      },
    }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

export interface ApplyReviewInput {
  cardId: string
  rating: number
  template: Template
  stability: number
  difficulty: number
  dueAt: number
  lapses: number
  reps: number
  reviewedAt: number
  durationMs?: number
}

/**
 * 计分评分事务：UPSERT review_states + INSERT review_logs(mode='review')。
 * 注意：不用事务包裹（同 importService 的 applyImport）。tauri-plugin-sql 的连接池会把同一批
 * db.execute 分散到不同连接，BEGIN 与后续写入不在同一连接上会触发 SQLITE_BUSY（database is locked）。
 * 每条语句独立提交（已知限制：中途失败会留下 review_states 已推进、却缺 review_logs 对应行）。
 */
export async function applyReview(input: ApplyReviewInput, h?: DbHandle): Promise<DbResult<void>> {
  const d = db(h)
  try {
    await d.execute(
      `INSERT INTO review_states (card_id, stability, difficulty, due_at, lapses, reps, suspended, last_review_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)
       ON CONFLICT(card_id) DO UPDATE SET
         stability = excluded.stability, difficulty = excluded.difficulty,
         due_at = excluded.due_at, lapses = excluded.lapses,
         reps = excluded.reps, last_review_at = excluded.last_review_at`,
      [input.cardId, input.stability, input.difficulty, input.dueAt,
       input.lapses, input.reps, input.reviewedAt],
    )
    await d.execute(
      `INSERT INTO review_logs (id, card_id, reviewed_at, rating, template, mode, duration_ms)
       VALUES (?1, ?2, ?3, ?4, ?5, 'review', ?6)`,
      [crypto.randomUUID(), input.cardId, input.reviewedAt, input.rating,
       input.template, input.durationMs ?? null],
    )
    await d.execute('UPDATE review_cards SET last_template = ?1 WHERE id = ?2', [input.template, input.cardId])
    return { ok: true, data: undefined }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

export interface PracticeLogInput {
  cardId: string
  rating: number
  template: Template
  reviewedAt: number
  durationMs?: number
}

/**
 * 不计分：只写日志（mode='practice'），review_states 全字段不动。
 * 同样每条语句独立提交（连接池限制见 applyReview）；中途失败至多留下已写的 last_template。
 */
export async function insertPracticeLog(input: PracticeLogInput, h?: DbHandle): Promise<DbResult<void>> {
  const d = db(h)
  try {
    await d.execute(
      `INSERT INTO review_logs (id, card_id, reviewed_at, rating, template, mode, duration_ms)
       VALUES (?1, ?2, ?3, ?4, ?5, 'practice', ?6)`,
      [crypto.randomUUID(), input.cardId, input.reviewedAt, input.rating,
       input.template, input.durationMs ?? null],
    )
    await d.execute('UPDATE review_cards SET last_template = ?1 WHERE id = ?2', [input.template, input.cardId])
    return { ok: true, data: undefined }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

export async function setLastTemplate(cardId: string, template: Template, h?: DbHandle): Promise<void> {
  await db(h).execute('UPDATE review_cards SET last_template = ?1 WHERE id = ?2', [template, cardId])
}

/** 薄弱词专项候选卡：lapses ≥ 阈值 ∪ 窗口内存在 rating = 1 的日志（含 practice）。 */
export async function getWeakCardIds(
  opts: { leechThreshold: number; recentWindowMs: number; now: number },
  h?: DbHandle,
): Promise<DbResult<string[]>> {
  const d = db(h)
  try {
    const rows = await d.select<{ id: string }>(
      `SELECT DISTINCT c.id FROM review_cards c
       LEFT JOIN review_states s ON s.card_id = c.id
       WHERE (s.lapses IS NOT NULL AND s.lapses >= ?1)
          OR c.id IN (SELECT card_id FROM review_logs WHERE rating = 1 AND reviewed_at >= ?2)`,
      [opts.leechThreshold, opts.now - opts.recentWindowMs])
    return { ok: true, data: rows.map(r => r.id) }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

/** 左栏计数：today = 到期且可出题的词数；weak = lapses ≥ 阈值 ∪ 窗口内 rating = 1。 */
export async function getStrategyCounts(
  opts: { leechThreshold: number; recentWindowMs: number; now: number },
  h?: DbHandle,
): Promise<DbResult<{ today: number; weak: number }>> {
  const d = db(h)
  try {
    const dueRows = await d.select<Record<string, any>>(
      `SELECT c.word_id FROM review_cards c
       JOIN review_states s ON s.card_id = c.id
       WHERE s.suspended = 0 AND s.due_at <= ?1`, [opts.now])
    const mask = await getAvailabilityMask(dueRows.map(r => r.word_id), d)
    if (!mask.ok) return mask
    const today = dueRows.filter(r => (mask.data[r.word_id] ? usableTemplates(mask.data[r.word_id]).length > 0 : false)).length

    const weak = await getWeakCardIds(opts, d)
    if (!weak.ok) return weak
    return { ok: true, data: { today, weak: weak.data.length } }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

/** 小结态统计：掌握度分桶 / 未来 7 日到期 / 近期评分分布（只读 mode='review'）。 */
export async function getStats(now: number = Date.now(), h?: DbHandle): Promise<DbResult<{
  masteryBuckets: number[]
  dueByDay: number[]
  recentRatings: { day: string; again: number; hard: number; good: number }[]
}>> {
  const d = db(h)
  try {
    const cardRows = await d.select<Record<string, any>>(
      'SELECT stability, last_review_at FROM review_states')
    const buckets = [0, 0, 0, 0, 0]
    for (const r of cardRows) {
      const s = r.stability === null || r.stability === undefined ? null : Number(r.stability)
      const m = toMastery(s)
      buckets[masteryTier(m)]++
    }

    const dayRows = await d.select<Record<string, any>>(
      `SELECT CAST((due_at - ?1) / 86400000 AS INTEGER) AS d, count(*) AS c
       FROM review_states WHERE suspended = 0 AND due_at <= ?1 + 7 * 86400000
       GROUP BY d`, [now])
    const dueByDay = Array.from({ length: 8 }, () => 0)
    for (const r of dayRows) {
      const d0 = Math.max(0, Number(r.d))
      if (d0 <= 7) dueByDay[d0] += Number(r.c)
    }

    const ratingRows = await d.select<Record<string, any>>(
      `SELECT date(reviewed_at / 1000, 'unixepoch', 'localtime') AS day, rating, count(*) AS c
       FROM review_logs WHERE mode = 'review' AND reviewed_at >= ?1
       GROUP BY day, rating ORDER BY day ASC`, [now - 14 * 86400000])
    const byDay = new Map<string, { day: string; again: number; hard: number; good: number }>()
    for (const r of ratingRows) {
      const e = byDay.get(r.day) ?? { day: r.day, again: 0, hard: 0, good: 0 }
      const n = Number(r.c)
      if (Number(r.rating) === 1) e.again += n
      else if (Number(r.rating) === 2) e.hard += n
      else e.good += n
      byDay.set(r.day, e)
    }
    return { ok: true, data: { masteryBuckets: buckets, dueByDay, recentRatings: [...byDay.values()] } }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

/** 缺内容词条：已注册卡但当前无任何可用模板。 */
export async function getAbsentWords(h?: DbHandle): Promise<DbResult<{ wordId: string; lemma: string }[]>> {
  const d = db(h)
  try {
    const rows = await d.select<Record<string, any>>(
      'SELECT c.word_id, w.lemma FROM review_cards c JOIN words w ON w.id = c.word_id')
    const mask = await getAvailabilityMask(rows.map(r => r.word_id), d)
    if (!mask.ok) return mask
    const out = rows
      .filter(r => usableTemplates(mask.data[r.word_id] ?? { translation: false, definition: false, example: false, phonetic: false }).length === 0)
      .map(r => ({ wordId: r.word_id, lemma: r.lemma }))
    return { ok: true, data: out }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}
