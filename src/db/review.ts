import { getDb } from './connection'
import type { DbHandle } from './init'
import type { DbResult } from './types'
import { FIELD_KEY_GROUPS, usableTemplates, type FieldMask } from '../lib/review/template'
import { masteryTier, weakestStability } from '../lib/review/mastery'
import type { CardContent, InitialFamiliarity, Template } from '../lib/review/types'
import type { QueueCandidate } from '../lib/review/queue'

const db = (h?: DbHandle): DbHandle => (h ?? (getDb() as unknown as DbHandle))

/**
 * 惰性注册：为每个词的每个可用题型补一张卡（UNIQUE(word_id, template) 防重）。
 *
 * 每个词只发**一条**多行 INSERT：registerAllWords 挂在打开复习模块的 UI 阻塞路径上，
 * 一词一卡时代是词数次往返，卡按题型拆开后最多变成 5 倍——几千词的库就是几万条顺序语句。
 * `INSERT OR IGNORE` 逐字保留（幂等性由 (word_id, template) 唯一索引保证，不是靠这里）。
 * 一个可用题型都没有的词不发语句：空 VALUES 列表不是合法 SQL。
 */
export async function registerCards(wordIds: string[], h?: DbHandle, opts: CandidateOpts = {}): Promise<void> {
  if (wordIds.length === 0) return
  const d = db(h)
  const mask = await getAvailabilityMask(wordIds, d)
  if (!mask.ok) return
  const now = Date.now()
  const allowListen = opts.allowListen === true
  for (const wordId of wordIds) {
    const m = mask.data[wordId]
    if (!m) continue
    const templates = usableTemplates(m, { allowListen })
    if (templates.length === 0) continue
    const params: unknown[] = []
    const values = templates.map((template, i) => {
      const base = i * 4
      params.push(crypto.randomUUID(), wordId, template, now)
      return `(?${base + 1}, ?${base + 2}, ?${base + 3}, ?${base + 4})`
    })
    await d.execute(
      `INSERT OR IGNORE INTO review_cards (id, word_id, template, created_at) VALUES ${values.join(', ')}`,
      params,
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
        // value 非空这一半在 SQL 判掉：getWordContent 的 firstOf(key) 要求 value !== ''，
        // 掩码若只看「有没有行」，就会出现「掩码说能出认读题、取内容拿到空释义」的空题
        // （v0.6.3 条目 4c 的同一类缺陷在另外三组上的翻版）。
        // 「含目标词」那一半**不放这里**：LIKE '%lemma%' 遇到 lemma 里带 % / _ 必须写 ESCAPE，
        // 口径会与内容层的 includes() 漂移；内容层用的就是同一个值，不会漂。
        return `EXISTS(SELECT 1 FROM field_values fv JOIN field_definitions fd ON fd.id = fv.field_id
                       WHERE fv.word_id = w.id AND fd.key IN (${keyList})
                         AND fv.value IS NOT NULL AND fv.value <> '') AS ${group}`
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

/** 运行时门控：依赖本机能力的题型。缺省全关（保守），由 service 层从 ttsGate 读出后传入。 */
export interface CandidateOpts {
  allowListen?: boolean
}

/** 行 → QueueCandidate（stability 空 = 新卡未首评；dueAt 空 = 新卡无意义取 0）。 */
function mapCandidate(r: Record<string, any>, template: Template): QueueCandidate {
  // fam 是**字段值**（自由文本），不是有约束的列：用户能在工作台把它改成任何内容。
  // 这里的三值夹取因此从「防列默认值」变成了真正的闸门——非法值一律当完全陌生处理。
  const fam = Number(r.initial_familiarity)
  return {
    cardId: r.card_id,
    wordId: r.word_id,
    template,
    stability: r.stability === null || r.stability === undefined ? null : Number(r.stability),
    dueAt: r.due_at === null || r.due_at === undefined ? 0 : Number(r.due_at),
    lastReviewAt: r.last_review_at === null || r.last_review_at === undefined ? null : Number(r.last_review_at),
    initialFamiliarity: (fam === 2 || fam === 3 ? fam : 1) as InitialFamiliarity,
  }
}

/**
 * 卡级闸门：一张卡只关心**自己那个题型**在不在该词的可用集合里。
 * 内容被删掉时（例如例句没了）受影响的只是填空题卡，同词其他题型的卡照常出题。
 */
function pickUsableCards(
  rows: Record<string, any>[],
  mask: Record<string, FieldMask>,
  opts: CandidateOpts,
): QueueCandidate[] {
  const allowListen = opts.allowListen === true
  const out: QueueCandidate[] = []
  for (const r of rows) {
    const m = mask[r.word_id]
    if (!m) continue
    const template = r.template as Template
    if (!usableTemplates(m, { allowListen }).includes(template)) continue
    out.push(mapCandidate(r, template))
  }
  return out
}

/** 候选池：到期卡 + 未首评新卡，只保留**自己那个题型可用**的卡。suspended 卡排除在外。 */
export async function getCandidates(
  now: number,
  h?: DbHandle,
  opts: CandidateOpts = {},
): Promise<DbResult<QueueCandidate[]>> {
  const d = db(h)
  try {
    const rows = await d.select<Record<string, any>>(
      `SELECT c.id AS card_id, c.word_id, c.template,
              s.stability, s.due_at, s.last_review_at,
              (SELECT fv.value FROM field_values fv
                 JOIN field_definitions fd ON fd.id = fv.field_id
                WHERE fv.word_id = c.word_id AND fd.key = 'initial_familiarity'
                ORDER BY fv.display_order LIMIT 1) AS initial_familiarity
       FROM review_cards c
       LEFT JOIN review_states s ON s.card_id = c.id
       WHERE s.card_id IS NULL OR (s.suspended = 0 AND s.due_at <= ?1)`,
      [now],
    )
    const mask = await getAvailabilityMask(rows.map(r => r.word_id), d)
    if (!mask.ok) return mask
    return { ok: true, data: pickUsableCards(rows, mask.data, opts) }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

/** 自由练习用：全部未挂起卡（含未到期的熟词），dueAt 原样带出。同样过卡级闸门。 */
export async function getAllCandidates(h?: DbHandle, opts: CandidateOpts = {}): Promise<DbResult<QueueCandidate[]>> {
  const d = db(h)
  try {
    const rows = await d.select<Record<string, any>>(
      `SELECT c.id AS card_id, c.word_id, c.template,
              s.stability, s.due_at, s.last_review_at,
              (SELECT fv.value FROM field_values fv
                 JOIN field_definitions fd ON fd.id = fv.field_id
                WHERE fv.word_id = c.word_id AND fd.key = 'initial_familiarity'
                ORDER BY fv.display_order LIMIT 1) AS initial_familiarity
       FROM review_cards c
       LEFT JOIN review_states s ON s.card_id = c.id
       WHERE s.card_id IS NULL OR s.suspended = 0`,
    )
    const mask = await getAvailabilityMask(rows.map(r => r.word_id), d)
    if (!mask.ok) return mask
    return { ok: true, data: pickUsableCards(rows, mask.data, opts) }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

/**
 * 取词条出题所需内容（lemma / 音标 / 词性 / 中英释义 / 例句 / 配对释义）。
 * 词不存在返回 null。
 *
 * 例句与释义的取法（v0.6.2，条目 5——取代 v0.6.1 的 display_order 近似）：
 *
 * 例句只取含有目标词的那一条；取不到就让 `example` 为空。掩码层（getAvailabilityMask）要求
 * example 字段的值非空，内容层（本函数）要求那条例句含目标词——两层各判一半，交集才是
 * 能挖空的句子。空 `example` 会让该词拿不到填空题：cardPresentable 在组卷时按卡剔掉
 * cloze（v0.6.3 条目 4c），所以这种词不会出填空题，题面也不会退化成 blankOut('') 那一条横线。
 * 例句里的词能否挖出来由 blankOut 保证。
 *
 * 配对释义与词性都由**选中那条例句**沿 `parent_id` 上溯而来。层级事实（已核源码）：
 * WordNet 的例句挂三层之下 `part_of_speech → english_definition → example_sentence → example`
 * （src/lib/wordnetParse.ts:85-95），而 ECDICT 不产例句（src/lib/ecdictParse.ts:100-118）。
 * 所以例句行最近的 `english_definition` 祖先就是它的释义、最近的 `part_of_speech`
 * 祖先是它的词性——这是精确解，不再是「序位之后的第一条」这种近似。
 *
 * 祖先链断掉时（例句行的 parent_id 为 NULL，或历史数据里 example 直接挂在词性下）不抛错、
 * 也不让整张卡消失：释义按 spec §3.2 的三档兜底退到该词第一条中文释义，词性退到该词第一个词性。
 * 注意第三档是中文、不是「该词第一条英文释义」——加了英文那档反而会把 spec 写明的兜底架空。
 *
 * 为什么不在 SQL 里做：上溯是变深度的树遍历，用相关子查询写出来既难读又难测；
 * 本函数的调用频率是「每张卡一次」，一次多取几十行 field_values 完全可以接受。
 */
export async function getWordContent(wordId: string, h?: DbHandle): Promise<CardContent | null> {
  const d = db(h)
  const rows = await d.select<{ lemma: string }>('SELECT lemma FROM words WHERE id = ?1', [wordId])
  if (rows.length === 0) return null
  const lemma = rows[0].lemma ?? ''

  // 一次性取全字段值 + 字段 key，上溯在内存里做。
  // value 列可空（schema 未加 NOT NULL，导入路径也原样透传），统一成空串再参与后续比较。
  const fvs = (await d.select<{
    id: string; parent_id: string | null; key: string; value: string | null; display_order: number
  }>(
    `SELECT fv.id, fv.parent_id, fd.key, fv.value, fv.display_order
       FROM field_values fv JOIN field_definitions fd ON fd.id = fv.field_id
      WHERE fv.word_id = ?1
      ORDER BY fv.display_order, fv.id`,
    [wordId],
  )).map(r => ({ ...r, value: r.value ?? '' }))

  const byId = new Map(fvs.map(r => [r.id, r]))
  /** 从某行沿 parent_id 上溯，返回第一个满足 key 的祖先（不含自身）。带深度上限防环。 */
  const ancestorWithKey = (fromId: string, key: string): typeof fvs[number] | null => {
    let cur = byId.get(fromId)?.parent_id ?? null
    for (let depth = 0; cur && depth < 8; depth++) {
      const row = byId.get(cur)
      if (!row) return null
      if (row.key === key) return row
      cur = row.parent_id
    }
    return null
  }

  const firstOf = (key: string) => fvs.find(r => r.key === key && r.value !== '')
  const allOf = (key: string) => fvs.filter(r => r.key === key)

  // 例句：只取含目标词的那一条（词边界近似——与 v0.6.1 的 LIKE 同口径，交由 blankOut 精确挖空）
  const example = fvs.find(
    r => (r.key === 'example_sentence' || r.key === 'example')
      && r.value !== ''
      && r.value.toLowerCase().includes(lemma.toLowerCase()),
  ) ?? null

  const translation = firstOf('chinese_definition')?.value ?? ''
  const definition = firstOf('english_definition')?.value ?? ''
  const phonetic = firstOf('phonetic')?.value ?? ''
  const fallbackPos = firstOf('part_of_speech')?.value ?? ''

  // 上溯：释义取最近的 english_definition 祖先；词性取最近的 part_of_speech 祖先。
  const glossRow = example ? ancestorWithKey(example.id, 'english_definition') : null
  const posRow = example ? ancestorWithKey(example.id, 'part_of_speech') : null

  // 中文侧：优先取例句所属词性下的第一条中文释义，取不到退到该词第一条。
  const zhUnderPos = posRow
    ? allOf('chinese_definition').find(r => r.parent_id === posRow.id && r.value !== '')
    : undefined

  // spec §3.2 的三档兜底，顺序不变：① 例句所属词性下的英文释义 ② 该词性下的中文释义
  // ③ 两者都无 → 沿用 v0.6.1 行为，该词第一条中文释义。不要在 ③ 之前插「该词第一条英文释义」
  // 那一档：它会让 spec 写明的兜底对任何有英文释义的词都变成死代码。
  const exampleGloss = glossRow?.value || zhUnderPos?.value || translation
  const matchedPos = posRow?.value || fallbackPos

  // 第一个义项的词性：中文释义那一支自己的 part_of_speech 祖先。
  // 与 `translation` 用的是**同一行**（firstOf('chinese_definition') 的语义），故必然同源；
  // 取不到祖先再退到该词第一个词性，与 translation 的兜底方向一致（都是「该词第一条」）。
  // 这里复用 firstOf 而不是另写一份 find 谓词：选择规则只有一处实现，不重判第二次。
  const firstZhRow = firstOf('chinese_definition')
  const firstSensePos = (firstZhRow && ancestorWithKey(firstZhRow.id, 'part_of_speech')?.value) || fallbackPos

  // 印在题面上的英文释义同理（v0.6.3 评审 F2）：`definition` 取的是第一条 english_definition，
  // 词性就必须是**那一行自己**的 part_of_speech 祖先。沿用跟着例句走的 partOfSpeech 会在多义项
  // 词上印出「第一义项的英文释义 + 例句所属义项的词性」——与 4a 在中译英上修掉的同一类错配。
  // 兜底同样退到该词第一个词性（与 firstSensePos 同向），使括号有值可标。
  const firstEnRow = firstOf('english_definition')
  const firstDefPos = (firstEnRow && ancestorWithKey(firstEnRow.id, 'part_of_speech')?.value) || fallbackPos

  return {
    lemma,
    phonetic,
    partOfSpeech: matchedPos,
    translation,
    definition,
    example: example?.value ?? '',
    exampleGloss,
    matchedPos,
    firstSensePos,
    firstDefPos,
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

/** 惰性注册：把库里全部词的可用题型卡补齐。 */
export async function registerAllWords(h?: DbHandle, opts: CandidateOpts = {}): Promise<void> {
  const d = db(h)
  const rows = await d.select<{ id: string }>('SELECT id FROM words')
  await registerCards(rows.map(r => r.id), d, opts)
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
 * 同样每条语句独立提交（连接池限制见 applyReview）；中途失败至多留下已写的日志。
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
    return { ok: true, data: undefined }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

/** 薄弱词候选：lapses ≥ 阈值 ∪ 窗口内存在 rating = 1 的日志（含 practice）。返回**词 id**。 */
export async function getWeakWordIds(
  opts: { leechThreshold: number; recentWindowMs: number; now: number },
  h?: DbHandle,
): Promise<DbResult<string[]>> {
  const d = db(h)
  try {
    const rows = await d.select<{ word_id: string }>(
      `SELECT DISTINCT c.word_id FROM review_cards c
       LEFT JOIN review_states s ON s.card_id = c.id
       WHERE (s.lapses IS NOT NULL AND s.lapses >= ?1)
          OR c.id IN (SELECT card_id FROM review_logs WHERE rating = 1 AND reviewed_at >= ?2)`,
      [opts.leechThreshold, opts.now - opts.recentWindowMs])
    return { ok: true, data: rows.map(r => r.word_id) }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

export interface WeakWordRow {
  wordId: string
  lemma: string
  /** 中文释义原文（可能含多行）；展示取首段由 UI 负责 */
  translation: string
  lapses: number
  recentMisses: number
}

/**
 * 薄弱词专项页的列表数据（spec §3.4），**一个词一行**。判定与 getWeakWordIds 同一宽口径：
 * lapses ≥ 阈值 ∪ 窗口内存在 rating = 1 的日志（**不按 mode 过滤**——练习里的答错/跳过
 * 同样是有价值的信号，v0.6 spec §3.8）。
 *
 * 一词多卡时两个计数各按自己的语义聚（v0.6.5）：
 * - `lapses` 取 MAX：它是**每张卡**的调度计数器，Leech 阈值也按卡判，词级读数就是其中
 *   最差的一张——与 getWordReviewOverlay 的 maxLapses 同一口径。
 * - `recentMisses` 取 SUM：它数的是**事件**不是状态，一个词在两张卡上各错过一次就是错过两次。
 *   （两侧的判据都写成逐行的 `c.id`，按 word_id 分组后自然摊到该词的全部卡上。）
 *
 * 排序：lapses 降序 → 窗口内答错次数降序 → lemma 升序。列表最上面的是最该补内容的词。
 */
export async function getWeakWordsWithCounts(
  opts: { leechThreshold: number; recentWindowMs: number; now: number },
  h?: DbHandle,
): Promise<DbResult<WeakWordRow[]>> {
  const d = db(h)
  try {
    const since = opts.now - opts.recentWindowMs
    // 释义取值与 getAvailabilityMask 同源：都按 FIELD_KEY_GROUPS.translation 的 key 集匹配，
    // 不硬编码字段 key，将来同义 key 增补时两处一起生效。键在 w.id 上——释义是**词级**的，
    // 一词多卡不该让同一行在不同卡上取到不同释义。
    const zhKeys = FIELD_KEY_GROUPS.translation.map(k => `'${k}'`).join(',')
    const missCount = `(SELECT count(*) FROM review_logs l
                         WHERE l.card_id = c.id AND l.rating = 1 AND l.reviewed_at >= ?2)`
    const rows = await d.select<Record<string, any>>(
      `SELECT c.word_id AS wordId,
              w.lemma AS lemma,
              COALESCE((SELECT fv.value FROM field_values fv
                          JOIN field_definitions fd ON fd.id = fv.field_id
                         WHERE fv.word_id = w.id AND fd.key IN (${zhKeys})
                         ORDER BY fv.display_order LIMIT 1), '') AS translation,
              COALESCE(MAX(s.lapses), 0) AS lapses,
              SUM(${missCount}) AS recentMisses
         FROM review_cards c
         JOIN words w ON w.id = c.word_id
         LEFT JOIN review_states s ON s.card_id = c.id
        GROUP BY c.word_id, w.lemma
       HAVING (MAX(s.lapses) IS NOT NULL AND MAX(s.lapses) >= ?1)
           OR SUM(${missCount}) > 0
        ORDER BY lapses DESC, recentMisses DESC, w.lemma ASC`,
      [opts.leechThreshold, since],
    )
    return {
      ok: true,
      data: rows.map(r => ({
        wordId: String(r.wordId),
        lemma: String(r.lemma),
        translation: String(r.translation ?? ''),
        lapses: Number(r.lapses),
        recentMisses: Number(r.recentMisses),
      })),
    }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

/**
 * 词级读数的**唯一**取数与折叠实现（spec §4.13 边界 2、§4.12）。
 *
 * 取数锚在 words（v0.6.4 修过的坑：卡是懒登记的，新词一张卡都没有），每词带出三样：
 * 熟悉度字段值、该词全部卡的 lapses 最大值、以及**逐卡**的 (template, stability)。
 *
 * 为什么要把 MIN 挪出 SQL：可用性掩码在 TypeScript 侧（getAvailabilityMask 读 field_values），
 * GROUP BY 里的 SQL 拿不到它。「只统计当前仍可出题的卡」只能在内存里折叠——所以取数保持
 * 逐卡出行（一次 SELECT，无相关子查询），折在 TS 里做。
 *
 * 两个读数各自的门是**不同**的，不要合并：
 * - `weakestStability` 只看**仍可出题**的卡的 stability（边界 2：内容被删掉的卡不该继续
 *   拖着这个词的读数），且未评分的卡（stability null）是「没数据」不参与，规则只有
 *   `weakestStability` 一处实现。
 * - `maxLapses` 取**全部**卡（可出题与否一律算）的 lapses 最大值，**刻意不过可用性门**：
 *   顽固词徽标说的是历史痛点（「这个词值得回去补内容」），内容被删正是它成立的理由；
 *   spec §4.12 明写 `MAX(s.lapses)` 不变。把它一并门掉，删了内容的顽固词徽标会跟着消失。
 *
 * 折叠后每词**都有**一行——无卡的词、有卡但全未评分的词、只有不可出题卡的词都在，
 * weakestStability 落在 null（cold start），这正是 chip 冷启动分支读的形状。
 *
 * 消费方有两个（`getWordReviewOverlay` 与 `getStats` 的直方图），共用这一个函数就是
 * 「与 overlay 同一口径」的兑现：两边不可能各改各的。
 */
interface WordReadingFold {
  maxLapses: number
  weakestStability: number | null
  familiarity: InitialFamiliarity
}

/** 逐卡出行；`template` 为 null 表示这是 LEFT JOIN 给无卡的词填的那一行。 */
interface WordReadingRow {
  word_id: string
  familiarity: string | null
  template: Template | null
  stability: number | null
  lapses: number | null
}

async function foldWordReadings(
  d: DbHandle,
): Promise<DbResult<Record<string, WordReadingFold>>> {
  const rows = await d.select<WordReadingRow>(
    `SELECT w.id AS word_id,
            (SELECT fv.value FROM field_values fv
               JOIN field_definitions fd ON fd.id = fv.field_id
              WHERE fv.word_id = w.id AND fd.key = 'initial_familiarity'
              ORDER BY fv.display_order LIMIT 1) AS familiarity,
            c.template AS template,
            s.stability AS stability,
            s.lapses AS lapses
       FROM words w
       LEFT JOIN review_cards c ON c.word_id = w.id
       LEFT JOIN review_states s ON s.card_id = c.id`)
  // 掩码只需这批词的 word_id。无卡的词在 LEFT JOIN 下也会出行（template/stability/lapses
  // 皆 null），它们的掩码自然落在「无内容 → 无可出题卡」那一支，故不必另行补查。
  const mask = await getAvailabilityMask(rows.map(r => r.word_id), d)
  if (!mask.ok) return mask

  const byWord = new Map<string, { stabilities: (number | null)[]; maxLapses: number; familiarity: number }>()
  for (const r of rows) {
    let acc = byWord.get(r.word_id)
    if (!acc) {
      acc = { stabilities: [], maxLapses: 0, familiarity: Number(r.familiarity) }
      byWord.set(r.word_id, acc)
    }
    if (r.template === null) continue   // 无卡的词的填充行：不贡献任何读数
    acc.maxLapses = Math.max(acc.maxLapses, Number(r.lapses ?? 0))
    // 可出题门按**这张卡自己的题型**判，与 pickUsableCards 同一句判据。
    const m = mask.data[r.word_id]
    if (m && usableTemplates(m).includes(r.template)) {
      acc.stabilities.push(r.stability)
    }
  }

  const out: Record<string, WordReadingFold> = {}
  for (const [id, acc] of byWord) {
    const fam = acc.familiarity
    out[id] = {
      maxLapses: acc.maxLapses,
      weakestStability: weakestStability(acc.stabilities),
      // 与 mapCandidate 同一道夹取：字段值是可编辑自由文本
      familiarity: (fam === 2 || fam === 3 ? fam : 1) as InitialFamiliarity,
    }
  }
  return { ok: true, data: out }
}

/**
 * 词级复习叠加层（v0.6.4）：给出全库每个词的连错次数与记忆强度所需的 stability，外加初始熟悉度。
 *
 * 徽标与记忆强度 chip 共用这一次取数——词表由虚拟滚动渲染、几百行，
 * 不能每行发一次 IPC。
 *
 * **不复用 getWeakWordsWithCounts**：那是薄弱词专项页的取数，口径是
 * 「lapses ≥ 阈值 ∪ 近 7 天 rating=1」，拿它当徽标数据源会让近 7 天错过一次的词
 * 全挂上徽标。徽标要的是严格 Leech（01 §3.6），只认 lapses。
 * 也**不是** getWeakWordIds——那已是词级，但两者判据不同：overlay 是展示层，薄弱词是筛选层。
 *
 * 锚在 words 而非 review_cards：卡是**懒登记**的（spec D3，新词不进到期集），
 * 收录时新开的词一张卡都没有。若按卡取数，这类词在结果里整个查不到，工作台只好
 * 回落成 ?? 1，用户在收录时选的「眼熟」会被显示成「陌生」——spec §4.7 要合的
 * 「收录时选择 → 首评预填 → 记忆强度」就断在这一环。故无卡的词也必须在结果里，
 * 带着 maxLapses 0 / weakestStability null / 自己的熟悉度，正好是 chip 冷启动读的形状
 * （spec §4.5：无复习记录时以熟悉度定档）。
 *
 * 「查不到 = 无记录」那套取向只适用于**到期集**（新词不进到期集），不适用于这里：
 * 这里要回答的是「这个词有多熟」，而这个词确实有记录，只是还没有复习记录。
 */
export interface WordReviewOverlay {
  maxLapses: number
  /** 词级记忆强度取最弱一环（spec 4.13）：该词**仍可出题的**已评分卡里稳定度的最小值；全未评分时为 null。 */
  weakestStability: number | null
  familiarity: InitialFamiliarity
}

export async function getWordReviewOverlay(h?: DbHandle): Promise<DbResult<Record<string, WordReviewOverlay>>> {
  const d = db(h)
  try {
    const folded = await foldWordReadings(d)
    if (!folded.ok) return folded
    return { ok: true, data: folded.data }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

export interface CardBreakdownRow {
  template: Template
  stability: number | null
  lastReviewAt: number | null
  /** 这张卡当前是否还能出题（内容没被删）。 */
  presentable: boolean
}

/**
 * 单词语的逐卡明细（spec 4.13）。**按需取数**：只在悬停记忆强度浮层时对一个词查一次，
 * 不进全库 overlay——几百个词 × 每个题型一行的量不值得常驻。
 */
export async function getWordCardBreakdown(wordId: string, h?: DbHandle): Promise<DbResult<CardBreakdownRow[]>> {
  const d = db(h)
  try {
    const rows = await d.select<Record<string, any>>(
      `SELECT c.template, s.stability, s.last_review_at
         FROM review_cards c
         LEFT JOIN review_states s ON s.card_id = c.id
        WHERE c.word_id = ?1`, [wordId])
    const mask = await getAvailabilityMask([wordId], d)
    if (!mask.ok) return mask
    const m = mask.data[wordId]
    return {
      ok: true,
      data: rows.map(r => ({
        template: r.template as Template,
        stability: r.stability === null || r.stability === undefined ? null : Number(r.stability),
        lastReviewAt: r.last_review_at === null || r.last_review_at === undefined ? null : Number(r.last_review_at),
        presentable: Boolean(m) && usableTemplates(m!).includes(r.template as Template),
      })),
    }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

/**
 * 左栏计数：**计数用卡**——today = 到期且可出题的**卡**数（顶部 chip 与复习控制台都印这个数，
 * 单位是「张」）；**视图用词**——todayWordIds 是同批卡摊平去重后的**词 id** 集合，
 * 供侧栏「复习到期」视图筛选，让那个视图的徽标与控制台报的是同一批词。
 * 同一批卡，两种投影：掩码判据（到期、未挂起、有可出题内容）完全一致，只有「按卡还是按词」这一步不同。
 * weak = lapses ≥ 阈值 ∪ 窗口内 rating = 1 的**词**数。
 */
export async function getStrategyCounts(
  opts: { leechThreshold: number; recentWindowMs: number; now: number; allowListen?: boolean },
  h?: DbHandle,
): Promise<DbResult<{ today: number; todayWordIds: string[]; weak: number }>> {
  const d = db(h)
  try {
    const dueRows = await d.select<Record<string, any>>(
      `SELECT c.word_id, c.template FROM review_cards c
       JOIN review_states s ON s.card_id = c.id
       WHERE s.suspended = 0 AND s.due_at <= ?1`, [opts.now])
    const mask = await getAvailabilityMask(dueRows.map(r => r.word_id), d)
    if (!mask.ok) return mask
    // 过滤判据与 today 逐字相同，且是**卡级**的：一张到期卡若自己那个题型的内容被删了，
    // 它永远不会被呈现，due_at 也就永远不推进——留在计数里就成了「侧栏说 32、进去 28」
    // 的那种分家（spec §4.4）。判词级（这个词还有别的可用题型）会把它放过。
    const dueCards = dueRows.filter(r => {
      const m = mask.data[r.word_id]
      return m ? usableTemplates(m, { allowListen: opts.allowListen === true }).includes(r.template as Template) : false
    })
    const today = dueCards.length
    const todayWordIds = [...new Set(dueCards.map(r => String(r.word_id)))]

    const weak = await getWeakWordIds(opts, d)
    if (!weak.ok) return weak
    return { ok: true, data: { today, todayWordIds, weak: weak.data.length } }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}

/** 小结态统计：记忆强度分桶（六档：档 0 无记录 + 1–5 各 20%）/ 未来 7 日到期 / 近期评分分布（只读 mode='review'）。 */
export async function getStats(now: number = Date.now(), h?: DbHandle): Promise<DbResult<{
  masteryBuckets: number[]
  dueByDay: number[]
  recentRatings: { day: string; again: number; hard: number; good: number }[]
}>> {
  const d = db(h)
  try {
    // 熟知度分布按**词**分桶（spec 01 §5.1）：锚 words、每词取「仍可出题的已评分卡」里
    // 最弱的一个 stability，与 overlay **同一份折叠实现**（foldWordReadings）——
    // 两侧共用一个函数，所以柱与 chip 不可能出现口径分家。
    // 无卡或无可出题已评分卡的词 stability 为 NULL → 档 0，因此柱高之和等于词库词数。
    const readings = await foldWordReadings(d)
    if (!readings.ok) return readings
    const buckets = [0, 0, 0, 0, 0, 0]
    for (const r of Object.values(readings.data)) {
      // 入参是 **stability（天）**，不是 mastery（0–1）——masteryTier 内部自己换算。
      buckets[masteryTier(r.weakestStability)]++
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
export async function getAbsentWords(h?: DbHandle, opts: CandidateOpts = {}): Promise<DbResult<{ wordId: string; lemma: string }[]>> {
  const d = db(h)
  try {
    const rows = await d.select<Record<string, any>>(
      'SELECT DISTINCT c.word_id, w.lemma FROM review_cards c JOIN words w ON w.id = c.word_id')
    const mask = await getAvailabilityMask(rows.map(r => r.word_id), d)
    if (!mask.ok) return mask
    const out = rows
      .filter(r => {
        const granted = usableTemplates(
          mask.data[r.word_id] ?? { translation: false, definition: false, example: false, phonetic: false },
          { allowListen: opts.allowListen === true },
        ).length === 0
        return granted
      })
      .map(r => ({ wordId: r.word_id, lemma: r.lemma }))
    return { ok: true, data: out }
  } catch (e: any) {
    return { ok: false, error: e.toString() }
  }
}
