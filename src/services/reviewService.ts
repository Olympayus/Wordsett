import * as reviewDb from '../db/review'
import { buildQueue, type QueueCandidate, type QueueResult } from '../lib/review/queue'
import { pickTemplate, templateAccuracy, type TemplateLog } from '../lib/review/template'
import { mastery, retrievability, elapsedDaysSince, NEW_CARD_RNOW, masteryTier } from '../lib/review/mastery'
import type { CardContent, InitialFamiliarity, ReviewMode, ReviewStrategy, Template } from '../lib/review/types'

export type { CardContent } from '../lib/review/types'

export const REVIEW_DEFAULTS = {
  retention: 0.9,
  leechThreshold: 4,
  newCardQuota: 10,
  queueLimit: 30,
  letterHighlight: true,
}

export interface ReviewParams {
  retention: number
  leechThreshold: number
  newCardQuota: number
  queueLimit: number
}

/** 自由练习的范围（与 Task 10 的 FreeScopePanel 载荷一致）。 */
export interface FreeScope {
  kind: 'category' | 'random' | 'today' | 'weak'
  categoryId?: string
  limit: number
}

export interface ReviewCardDTO {
  cardId: string
  wordId: string
  template: Template
  prompt: Record<string, unknown>
  answer: Record<string, unknown>
  sched: {
    dueAt: number
    reps: number
    lapses: number
    lastReviewAt: number | null
    mastery: number | null
    rNow: number
  }
}

const BLANK = '____'

/** 取词条内容（不属于表操作，实现在本文件内）。SQL 出错只丢这一张卡，不让整场会话失败。 */
async function loadContent(wordId: string): Promise<CardContent | null> {
  try { return await reviewDb.getWordContent(wordId) } catch { return null }
}

/** 把目标词在例句中挖空；找不到目标词时退回「整句 + 空白」形态，保证题干非空。 */
export function blankOut(sentence: string, lemma: string): string {
  if (!sentence) return BLANK
  const re = new RegExp(`\\b${lemma.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*\\b`, 'gi')
  const out = sentence.replace(re, BLANK)
  return out === sentence ? `${sentence} ${BLANK}` : out
}

/** 组装题面与答案。严格按模板声明字段，题面不含答案字段。 */
export function assembleCardDTO(
  candidate: QueueCandidate,
  template: Template,
  content: CardContent,
  lastTemplate: Template | null,
): ReviewCardDTO {
  const m = mastery(candidate.stability)
  const rNow = candidate.stability === null
    ? NEW_CARD_RNOW[candidate.initialFamiliarity]
    : retrievability(candidate.stability, elapsedDaysSince(candidate.lastReviewAt, Date.now()))

  let prompt: Record<string, unknown> = {}
  let answer: Record<string, unknown> = {}

  switch (template) {
    case 'recognize': {
      const options = shuffleDeterministic([content.translation, ...content.distractors].slice(0, 4), candidate.cardId)
      prompt = { lemma: content.lemma, phonetic: content.phonetic, options }
      answer = { translation: content.translation, partOfSpeech: content.partOfSpeech }
      break
    }
    case 'cloze': {
      prompt = { sentence: blankOut(content.example, content.lemma), partOfSpeech: content.partOfSpeech }
      answer = { lemma: content.lemma, sentence: content.example, phonetic: content.phonetic }
      break
    }
    case 'recall': {
      prompt = { translation: content.translation, partOfSpeech: content.partOfSpeech }
      answer = { lemma: content.lemma, phonetic: content.phonetic }
      break
    }
    case 'english_def': {
      prompt = { definition: content.definition, partOfSpeech: content.partOfSpeech }
      answer = { lemma: content.lemma, phonetic: content.phonetic }
      break
    }
    case 'listen': {
      prompt = { playAudio: true }
      answer = { lemma: content.lemma, phonetic: content.phonetic, translation: content.translation }
      break
    }
  }

  void lastTemplate
  return {
    cardId: candidate.cardId,
    wordId: candidate.wordId,
    template,
    prompt,
    answer,
    sched: {
      dueAt: candidate.dueAt,
      reps: 0,
      lapses: 0,
      lastReviewAt: candidate.lastReviewAt,
      mastery: m,
      rNow,
    },
  }
}

/** 确定性洗牌：同一 cardId 总是得到同一顺序，避免重复出题时选项乱跳。 */
function shuffleDeterministic<T>(items: T[], seed: string): T[] {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) & 0x7fffffff
    const j = h % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const RECOGNIZE_MIN_DISTRACTORS = 3

/**
 * 认读附加闸门（spec §4.1）：库内可用作干扰的释义不足 3 个时该词不能出认读题。
 * 返回该词实际可出的模板集。
 */
export function templatesWithDistractorGate(
  available: Template[],
  distractors: number,
): Template[] {
  if (distractors >= RECOGNIZE_MIN_DISTRACTORS) return available
  return available.filter(t => t !== 'recognize')
}

export async function getStrategyCounts(params: ReviewParams) {
  const r = await reviewDb.getStrategyCounts({
    leechThreshold: params.leechThreshold,
    recentWindowMs: 7 * 86_400_000,
    now: Date.now(),
  })
  if (!r.ok) return { today: 0, weak: 0 }
  return { today: r.data.today, weak: r.data.weak }
}

export async function getAbsent() {
  const r = await reviewDb.getAbsentWords()
  return r.ok ? r.data : []
}

/** 组卷：注册候选卡 → 取候选 → 按策略筛选 → buildQueue → 逐卡选题型并组装 DTO。 */
export async function getQueue(
  strategy: ReviewStrategy,
  params: ReviewParams,
  freeScope?: FreeScope,
): Promise<{ queue: ReviewCardDTO[]; absent: { wordId: string; lemma: string }[]; result: QueueResult }> {
  await reviewDb.registerAllWords()
  const now = Date.now()
  const EMPTY: QueueResult = { queue: [], dueCount: 0, newCount: 0, absentCount: 0 }

  // 自由练习要够到未到期的熟词，因此走不看 due_at 的候选池
  const candRes = strategy === 'free'
    ? await reviewDb.getAllCandidates()
    : await reviewDb.getCandidates(now)
  if (!candRes.ok) return { queue: [], absent: [], result: EMPTY }

  let candidates = candRes.data
  if (strategy === 'weak') {
    candidates = await filterWeak(candidates, params, now)
  } else if (strategy === 'free') {
    candidates = await filterFree(candidates, freeScope)
  }

  const result = strategy === 'free'
    ? buildQueue(candidates, { now, newCardQuota: 0, queueLimit: freeScope?.limit ?? 20 })
    : buildQueue(candidates, { now, newCardQuota: params.newCardQuota, queueLimit: params.queueLimit })

  // 全库随机：buildQueue 的 R_now 排序会覆盖乱序，故在最后重新打乱
  const ordered = freeScope?.kind === 'random' ? shuffle([...result.queue]) : result.queue

  const logs = await reviewDb.getTemplateLogs(ordered.map(c => c.cardId))
  const logMap = logs.ok ? logs.data : {}

  const queue: ReviewCardDTO[] = []
  for (const c of ordered) {
    const meta = await reviewDb.getCardMeta(c.cardId)
    const lastTemplate = meta.ok && meta.data ? meta.data.lastTemplate : null
    const content = await loadContent(c.wordId)
    if (!content) continue
    const templates = templatesWithDistractorGate(c.availableTemplates, content.distractors.length)
    const template = pickTemplate(templates, logMap[c.cardId] ?? [], lastTemplate)
    if (!template) continue
    queue.push(assembleCardDTO(c, template, content, lastTemplate))
  }

  const absent = await getAbsent()
  return { queue, absent, result: { ...result, queue: ordered } }
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}

/** 薄弱词筛选与左栏计数同源：薄弱定义只有 getWeakCardIds 一处实现。 */
async function filterWeak(candidates: QueueCandidate[], params: ReviewParams, now: number): Promise<QueueCandidate[]> {
  const r = await reviewDb.getWeakCardIds({
    leechThreshold: params.leechThreshold,
    recentWindowMs: 7 * 86_400_000,
    now,
  })
  if (!r.ok) return []
  const ids = new Set(r.data)
  return candidates.filter(c => ids.has(c.cardId))
}

async function filterFree(
  candidates: QueueCandidate[],
  scope?: FreeScope,
): Promise<QueueCandidate[]> {
  if (!scope) return []
  if (scope.kind === 'today') return candidates
  if (scope.kind === 'category' && scope.categoryId) {
    // 复用现有 getAllWordCategoryMap（src/db/categories.ts），不新增查询
    const { getAllWordCategoryMap } = await import('../db/categories')
    const res = await getAllWordCategoryMap()
    if (!res.ok) return []
    const ids = Object.entries(res.data)
      .filter(([, cats]) => cats.includes(scope.categoryId as string))
      .map(([wordId]) => wordId)
    return candidates.filter(c => ids.includes(c.wordId))
  }
  // 'random'：全部候选交给 buildQueue 截断，乱序在 getQueue 末尾统一做
  return candidates
}

/** 评分结果：db 层用 DbResult 吞掉 SQL 异常并返回 ok:false，service 必须把它透出给调用方。 */
export interface RateCardResult {
  ok: boolean
  error?: string
  /** 计分模式写库成功后的新到期时间；练习模式为 null */
  dueAt: number | null
}

/** 评分：计分走 FSRS 推进，练习只写日志。返回落库结果，失败时调用方不应推进会话。 */
export async function rateCard(input: {
  cardId: string
  rating: number
  template: Template
  mode: ReviewMode
  durationMs?: number
  retention?: number
}): Promise<RateCardResult> {
  const now = Date.now()
  if (input.mode === 'practice') {
    const r = await reviewDb.insertPracticeLog({ ...input, reviewedAt: now })
    return { ok: r.ok, error: r.ok ? undefined : r.error, dueAt: null }
  }
  const st = await reviewDb.getState(input.cardId)
  // 读不到旧状态就不能推进：prev 落空会让 FSRS 把已复习的卡当新卡重算，静默清掉它的进度
  if (!st.ok) return { ok: false, error: st.error, dueAt: null }
  const prev = st.data
  const elapsedDays = prev?.lastReviewAt == null
    ? 0
    : Math.max(0, Math.floor((now - prev.lastReviewAt) / 86_400_000))
  const next = await invokeFsrsNext(
    prev?.stability ?? null,
    prev?.difficulty ?? null,
    elapsedDays,
    input.rating,
    input.retention,
  )
  const intervalDays = Math.max(1, Math.floor(next.intervalDays))
  const dueAt = now + intervalDays * 86_400_000
  const w = await reviewDb.applyReview({
    cardId: input.cardId,
    rating: input.rating,
    template: input.template,
    stability: next.stability,
    difficulty: next.difficulty,
    dueAt,
    lapses: (prev?.lapses ?? 0) + (input.rating === 1 ? 1 : 0),
    reps: (prev?.reps ?? 0) + 1,
    reviewedAt: now,
    durationMs: input.durationMs,
  })
  return { ok: w.ok, error: w.ok ? undefined : w.error, dueAt: w.ok ? dueAt : null }
}

interface FsrsNext {
  stability: number
  difficulty: number
  intervalDays: number
}

/** 调 Rust 侧 fsrs_next，按本次 rating 取对应档。 */
async function invokeFsrsNext(
  stability: number | null,
  difficulty: number | null,
  elapsedDays: number,
  rating: number,
  retention?: number,
): Promise<FsrsNext> {
  const { invoke } = await import('@tauri-apps/api/core')
  const safeRetention = Math.min(0.98, Math.max(0.7, retention ?? 0.9))
  const out = await invoke<Record<string, FsrsNext>>('fsrs_next', {
    stability, difficulty, elapsedDays, retention: safeRetention,
  })
  const key = rating === 1 ? 'again' : rating === 2 ? 'hard' : rating === 3 ? 'good' : 'easy'
  return out[key]
}

export async function getStats() {
  const r = await reviewDb.getStats()
  return r.ok ? r.data : { masteryBuckets: [0, 0, 0, 0, 0], dueByDay: Array(8).fill(0), recentRatings: [] }
}

export async function getOverview(params: ReviewParams) {
  await reviewDb.registerAllWords()
  const now = Date.now()
  const candRes = await reviewDb.getCandidates(now)
  const candidates = candRes.ok ? candRes.data : []
  const result = buildQueue(candidates, { now, newCardQuota: params.newCardQuota, queueLimit: params.queueLimit })
  const stats = await getStats()
  return {
    total: result.queue.length,
    newCount: result.newCount,
    estimateMinutes: Math.max(1, Math.round(result.queue.length * 0.3)),
    masteryBuckets: stats.masteryBuckets,
  }
}

export { masteryTier, templateAccuracy }
export type { TemplateLog, InitialFamiliarity, Template, ReviewStrategy, ReviewMode }
