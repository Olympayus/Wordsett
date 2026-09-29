import * as reviewDb from '../db/review'
import type { WeakWordRow } from '../db/review'
import { isListenEnabled } from '../lib/review/ttsGate'
import { buildQueue, type QueueCandidate, type QueueResult } from '../lib/review/queue'
import { selectByCategories } from '../lib/review/categoryCounts'
import { cardPresentable, templateAccuracy, type TemplateLog } from '../lib/review/template'
import { mastery, retrievability, elapsedDaysSince, NEW_CARD_RNOW, defaultRatingFor } from '../lib/review/mastery'
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

/** 自由练习的范围（与 FreeScopePanel 的载荷一致）。v0.6.2 起分类改多选。 */
export interface FreeScope {
  kind: 'category' | 'random' | 'today' | 'weak'
  categoryIds?: string[]
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
    /** 未首评时按词条级初始熟悉度给的三键视觉默认态（spec 4.6）；null = 不预填 */
    defaultRating: 1 | 2 | 3 | null
  }
}

const BLANK = '____'

/** 取词条内容（不属于表操作，实现在本文件内）。SQL 出错只丢这一张卡，不让整场会话失败。 */
async function loadContent(wordId: string): Promise<CardContent | null> {
  try { return await reviewDb.getWordContent(wordId) } catch { return null }
}

/**
 * 把目标词在例句中挖空。
 *
 * 只处理「例句里确实有目标词」这一种情况——例句的选用已由 `getWordContent` 尽量保证（它只取含有
 * 目标词的条目，取不到就让 example 为空）。
 * v0.6.3 条目 4c 起，取不到例句的词条**不再**拿到填空题（cardPresentable 在组卷时剔掉），
 * 下面这条「退化分支」因此不再是出题路径上的常态，只作为防御保留：万一有别的调用方
 * 直接调 blankOut，它也不该崩。
 * 另外例句「含原词」在 db 层是 toLowerCase().includes 的近似判定，与这里的词边界正则未必一致，
 * 故原样返回的分支是真会走到的：宁可让题面退化也不虚构一个句子。
 *
 * v0.6.2：不再拼接「在句中意为 xxx」（那改由 prompt.gloss 独立承载、前端另起一行渲染），
 * 故删掉 gloss 参数。词性入句由 clozeSentence 负责。
 */
export function blankOut(sentence: string, lemma: string): string {
  if (!sentence) return BLANK
  const re = new RegExp(`\\b${lemma.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*\\b`, 'gi')
  const out = sentence.replace(re, BLANK)
  return out === sentence ? sentence : out
}

/**
 * 填空题题面：挖空 + 词性入句（v0.6.2 条目 5）。
 *
 * 词性插在**第一个**挖空之后并带括号：`The soldiers ____ (v.) out.`
 * ——括号紧跟空缺，读者不离开句子就知道该填什么词性。词性为空时不插，不留一对空括号。
 *
 * 句子为空（无例句）时 blankOut 返回单条横线，此处照常补括号，题面退化但不崩。
 * v0.6.3 条目 4c 起，取不到例句的词条不再拿到填空题（cardPresentable 在组卷时剔掉），
 * 这条退化分支因此不再是出题路径上的常态，只作为防御保留：万一有别的调用方直接调
 * clozeSentence，它也不该崩。
 */
export function clozeSentence(sentence: string, lemma: string, partOfSpeech: string): string {
  const blanked = blankOut(sentence, lemma)
  if (!partOfSpeech) return blanked
  const at = blanked.indexOf(BLANK)
  if (at < 0) return blanked
  const end = at + BLANK.length
  return `${blanked.slice(0, end)} (${partOfSpeech})${blanked.slice(end)}`
}

/** 组装题面与答案。严格按模板声明字段，题面不含答案字段。 */
export function assembleCardDTO(
  candidate: QueueCandidate,
  template: Template,
  content: CardContent,
): ReviewCardDTO {
  const m = mastery(candidate.stability)
  const rNow = candidate.stability === null
    ? NEW_CARD_RNOW[candidate.initialFamiliarity]
    : retrievability(candidate.stability, elapsedDaysSince(candidate.lastReviewAt, Date.now()))

  let prompt: Record<string, unknown> = {}
  let answer: Record<string, unknown> = {}

  switch (template) {
    case 'recognize': {
      const options = shuffleDeterministic(recognizeOptions(content), candidate.cardId)
      // 词性同时挂 prompt 与 answer（v0.6.3 条目 3，评审修复 F1）。
      // prompt 侧：认读卡面把词性渲染在音标之后，缺了它那段渲染就是永远走不到的死分支。
      //   这**不构成泄题**——该卡面本来就把目标词（lemma）大字渲染出来了，词性是已知词的注，
      //   与 `listen` 不同：那边 lemma 不得早渲染，词性会反过来提示答案。
      // answer 侧：揭示时读的那份，**保留不动**（同一来源的复制，不是搬家）——
      //   是否有人读它做揭示内容无法确定，复制是最容易回退的改法。
      prompt = { lemma: content.lemma, phonetic: content.phonetic, partOfSpeech: content.partOfSpeech, options }
      answer = { translation: content.translation, partOfSpeech: content.partOfSpeech }
      break
    }
    case 'cloze': {
      // 题面：挖空 + 词性入句；释义作为独立字段下行渲染（v0.6.2 条目 5）。
      // 词性用 matchedPos 而不是 content.partOfSpeech——两者此值相同，但 matchedPos
      // 显式表达「这个括号是跟着例句走的」，读代码的人不必回 db 层确认。
      prompt = {
        sentence: clozeSentence(content.example, content.lemma, content.matchedPos),
        gloss: content.exampleGloss,
        partOfSpeech: content.matchedPos,
      }
      answer = { lemma: content.lemma, sentence: content.example, phonetic: content.phonetic }
      break
    }
    case 'recall': {
      // 释义与词性同源（v0.6.3 条目 4a）：都用第一个义项那一支，不用 matchedPos
      // ——后者跟着例句走，多义项词会与 translation 错配成「第一义项的释义 + 第二义项的词性」。
      prompt = { translation: content.translation, partOfSpeech: content.firstSensePos }
      answer = { lemma: content.lemma, phonetic: content.phonetic }
      break
    }
    case 'english_def': {
      // 释义与词性同源（v0.6.3 评审 F2）：题面把 definition 与词性并排印在一行，
      // 两者必须同一义项，故词性读 firstDefPos（第一条英文释义自己的 part_of_speech 祖先），
      // 不读跟着例句走的 partOfSpeech——多义项词会错配成「第一义项的释义 + 例句义项的词性」。
      prompt = { definition: content.definition, partOfSpeech: content.firstDefPos }
      answer = { lemma: content.lemma, phonetic: content.phonetic }
      break
    }
    case 'listen': {
      prompt = { playAudio: true }
      answer = { lemma: content.lemma, phonetic: content.phonetic, translation: content.translation }
      break
    }
  }

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
      defaultRating: defaultRatingFor({ stability: candidate.stability, initialFamiliarity: candidate.initialFamiliarity }),
    },
  }
}

/**
 * 认读选项：正确释义 + 至多 3 个干扰项，且选项文本两两不同、都不等于正确释义。
 * 干扰释义按跨词采样而来，可能与本词释义同文（两个一模一样的选项 + React key 重复）。
 */
function recognizeOptions(content: CardContent): string[] {
  const out = [content.translation]
  const seen = new Set(out.map(o => o.trim()))
  for (const d of content.distractors) {
    const t = d.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(d)
    if (out.length === 4) break
  }
  return out
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

export async function getStrategyCounts(params: ReviewParams) {
  const r = await reviewDb.getStrategyCounts({
    leechThreshold: params.leechThreshold,
    recentWindowMs: 7 * 86_400_000,
    now: Date.now(),
    allowListen: isListenEnabled(),
  })
  if (!r.ok) return { today: 0, weak: 0 }
  return { today: r.data.today, weak: r.data.weak }
}

export async function getAbsent() {
  const r = await reviewDb.getAbsentWords(undefined, { allowListen: isListenEnabled() })
  return r.ok ? r.data : []
}

/** 薄弱词专项页的列表（spec §3.4）。失败返回空数组，页面走空态。 */
export async function getWeakWords(params: ReviewParams): Promise<WeakWordRow[]> {
  const r = await reviewDb.getWeakWordsWithCounts({
    leechThreshold: params.leechThreshold,
    recentWindowMs: 7 * 86_400_000,
    now: Date.now(),
  })
  return r.ok ? r.data : []
}

/** 组卷：注册候选卡 → 取候选 → 按策略筛选 → buildQueue → 逐卡过闸门并组装 DTO。 */
export async function getQueue(
  strategy: ReviewStrategy,
  params: ReviewParams,
  freeScope?: FreeScope,
): Promise<{ queue: ReviewCardDTO[]; absent: { wordId: string; lemma: string }[]; result: QueueResult }> {
  // 门控只在 service 层读一次，往下传普通参数——db 层不 import ttsGate，保持可测。
  // 注册也要带着它：卡按「注册时可用题型」建，漏传会让听辨卡压根不落库
  // （听辨是否可出题由取数侧的卡级闸门再判一次，两道门各管一段）。
  const allowListen = isListenEnabled()
  await reviewDb.registerAllWords(undefined, { allowListen })
  const now = Date.now()
  const EMPTY: QueueResult = { queue: [], dueCount: 0, newCount: 0 }

  // 自由练习要够到未到期的熟词，因此走不看 due_at 的候选池；
  // 唯一例外是「今日队列重练」——它按定义就是今日到期队列，沿用只看 due_at 的源。
  const freeToday = strategy === 'free' && freeScope?.kind === 'today'
  const candRes = strategy === 'free' && !freeToday
    ? await reviewDb.getAllCandidates(undefined, { allowListen })
    : await reviewDb.getCandidates(now, undefined, { allowListen })
  if (!candRes.ok) return { queue: [], absent: [], result: EMPTY }

  let candidates = candRes.data
  // 薄弱词专项已并入自由练习的 scope.kind = 'weak'（spec §3.2），此处不再有独立的 weak 策略分支
  if (strategy === 'free') {
    candidates = await filterFree(candidates, freeScope, params, now)
  }

  // 自由练习的候选池本就含未到期的熟词（getAllCandidates 的全部意义），
  // 故 includeNotDue = true：否则 buildQueue 的 due 过滤会把这些卡全数丢掉，练习恒为空。
  const result = strategy === 'free'
    ? buildQueue(candidates, { now, newCardQuota: 0, queueLimit: freeScope?.limit ?? 20, includeNotDue: true })
    : buildQueue(candidates, { now, newCardQuota: params.newCardQuota, queueLimit: params.queueLimit })

  // 全库随机：buildQueue 的 R_now 排序会覆盖乱序，故在最后重新打乱
  const ordered = freeScope?.kind === 'random' ? shuffle([...result.queue]) : result.queue

  const queue: ReviewCardDTO[] = []
  for (const c of ordered) {
    const content = await loadContent(c.wordId)
    if (!content) continue
    if (!cardPresentable(c.template, content)) continue
    queue.push(assembleCardDTO(c, c.template, content))
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

/** 薄弱词筛选与薄弱词计数同源：薄弱定义只有 getWeakCardIds 一处实现。 */
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

/**
 * 自由练习的范围筛选。'today' 的候选源已是到期集（见 getQueue 的 freeToday 分支），原样透传；
 * 'weak' 复用 filterWeak（薄弱定义只有 getWeakCardIds 一处实现），不再把整库交给用户。
 */
async function filterFree(
  candidates: QueueCandidate[],
  scope: FreeScope | undefined,
  params: ReviewParams,
  now: number,
): Promise<QueueCandidate[]> {
  if (!scope) return []
  if (scope.kind === 'today') return candidates
  if (scope.kind === 'weak') return filterWeak(candidates, params, now)
  // 分类强化：即便一个分类都没勾也进这个分支（fail-closed）——空选区是「没选」，
  // 不能掉到末尾的 'random' 那路把整库交出去。UI 侧另有按钮禁用兜底，两处各守一边。
  // 选择本身是 selectByCategories 的纯逻辑（spec §8.1），这里只负责把映射读出来。
  if (scope.kind === 'category') {
    if (!scope.categoryIds || scope.categoryIds.length === 0) return []
    // 复用现有 getAllWordCategoryMap（src/db/categories.ts），不新增查询。
    const { getAllWordCategoryMap } = await import('../db/categories')
    const res = await getAllWordCategoryMap()
    if (!res.ok) return []
    const wanted = new Set(selectByCategories(candidates.map(c => c.wordId), scope.categoryIds, res.data))
    return candidates.filter(c => wanted.has(c.wordId))
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
  const next = out[key]
  // 跨语言字段名漂移的兜底：Tauri 不映射返回值，读到 undefined 会一路算成 NaN，
  // 直到 review_states.due_at（INTEGER NOT NULL）才炸——那已是写库失败。这里就喊停。
  if (!Number.isFinite(next?.intervalDays) || next.intervalDays < 1) {
    throw new Error(`fsrs_next 返回的 ${key}.intervalDays 非法：${String(next?.intervalDays)}`)
  }
  return next
}

export async function getStats() {
  const r = await reviewDb.getStats()
  return r.ok ? r.data : { masteryBuckets: [0, 0, 0, 0, 0, 0], dueByDay: Array(8).fill(0), recentRatings: [] }
}

/**
 * 本轮真正出得了题的卡：卡级闸门逐张判，剔除本轮出不了的（新词数就不会虚高）。
 *
 * 用途（v0.6.3 打磨后收窄到一处）：只服务 `getOverview().newCount`——「本轮会引入几个新词」。
 * 此前它还算「今日待复习总数」，那个数现在走掩码层的 `getStrategyCounts().today`（见 getOverview）。
 *
 * 为什么这里仍要过闸门：新词数若把「内容层面出不了题」的新卡也算进去，控制台会印
 * 「新词: 3」而本轮只引入 2 个。
 */
async function deliverable(candidates: QueueCandidate[]): Promise<QueueCandidate[]> {
  const out: QueueCandidate[] = []
  for (const c of candidates) {
    const content = await loadContent(c.wordId)
    if (!content) continue
    if (!cardPresentable(c.template, content)) continue
    out.push(c)
  }
  return out
}

/**
 * 今日队列：候选 → buildQueue → 卡级闸门（v0.6.3 打磨后只剩一个用途：取本轮新词数）。
 *
 * 此前它同时是「今日待复习总数」的来源，控制台与标题栏 chip 都读它——那个数因此会被
 * 当日额度（queueLimit）截断，与「今天到底积压了多少」不是一回事，见 getOverview。
 *
 * 刻意**不**在这里调 registerAllWords：那是「给全库每个词的每个可用题型各补一张卡」的写循环
 * （最多每词 5 条 INSERT，生产环境每条都是一次跨 IPC 的 db 调用），放进分钟级轮询会让
 * 标题栏变成写放大来源。补卡仍由 getQueue / getOverview 负责。
 * 补卡与否**不影响** getOverview 的 total：新补出来的卡是 new 卡、没有 due_at，
 * 走不到 getStrategyCounts 的到期集里——两处因此不再需要靠「进过一次复习模块」来对齐。
 */
async function todayQueue(params: ReviewParams, now: number): Promise<QueueCandidate[]> {
  const candRes = await reviewDb.getCandidates(now, undefined, { allowListen: isListenEnabled() })
  const candidates = candRes.ok ? candRes.data : []
  const result = buildQueue(candidates, { now, newCardQuota: params.newCardQuota, queueLimit: params.queueLimit })
  return deliverable(result.queue)
}

export async function getOverview(params: ReviewParams) {
  // 与 getQueue 同一个门控读法：补卡时要按「当前 TTS 可用」决定听辨卡建不建
  // （getQueue 的读法见上；两处各自读一次，中间不缓存——门控是本机能力的实时快照）。
  const allowListen = isListenEnabled()
  await reviewDb.registerAllWords(undefined, { allowListen })
  const now = Date.now()
  const queue = await todayQueue(params, now)
  const stats = await getStats()
  // 到期待复习数走掩码层的到期集（v0.6.3 打磨），**不是**本轮队列的长度：
  // 用户要的是「系统判断今天该复习多少词」——那是掌握程度（due_at）的事，
  // 与「本轮最多出多少题」（队列上限）无关；与卡级内容闸门也无关，那道判的是
  // 「这张现在能不能出题」，让它参与会让同一个数随某个词的内容变动而忽高忽低、
  // 且做完一整轮也未必归零。
  // 代价（有意接受）：到期积压超过队列上限时，做完一轮这个数不会归零，剩下留到下一轮
  // ——这正是「轮次上限只影响单次学多少个词」的读法。见 DueBadge 的同款说明。
  const { today } = await getStrategyCounts(params)
  return {
    total: today,
    // 新词数仍是本轮队列里的实际新卡数（额度、队列上限、卡级闸门都算数）：它答的是
    // 「本轮会引入几个新词」，与上面那个到期积压是两个量，故不从 total 派生。
    newCount: queue.filter(c => c.stability === null).length,
    // 本轮队列的时长估算。当前**没有消费者**（v0.6.3 起控制台不再读它），
    // 保留是为了不改动 getOverview 的返回形状；不要据此认为它跟着 total 走。
    estimateMinutes: Math.max(1, Math.round(queue.length * 0.3)),
    // 三图与近 14 天趋势都要 dueByDay / recentRatings，故整包透出而非只给 masteryBuckets
    stats,
  }
}

/**
 * 当前有候选的 wordId 集（v0.6.2 条目 10）。分类强化要报「点这个分类能出多少题」，
 * 而候选口径必须与出题一致，故复用同一条候选链（含 allowListen 门控）。
 */
export async function getDueWordIds(params: ReviewParams): Promise<Set<string>> {
  void params
  const r = await reviewDb.getCandidates(Date.now(), undefined, { allowListen: isListenEnabled() })
  return new Set(r.ok ? r.data.map(c => c.wordId) : [])
}

export { templateAccuracy }
export type { TemplateLog, InitialFamiliarity, Template, ReviewStrategy, ReviewMode }
