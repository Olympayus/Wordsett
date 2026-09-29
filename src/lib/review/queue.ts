import { NEW_CARD_RNOW, elapsedDaysSince, retrievability } from './mastery'
import type { InitialFamiliarity, Template } from './types'

export interface QueueCandidate {
  cardId: string
  wordId: string
  /** 这张卡自己的题型——卡不再由运行时选题型，题型是卡的属性。 */
  template: Template
  stability: number | null      // null = 新卡未首评
  dueAt: number                 // 新卡无意义，传 0
  lastReviewAt: number | null
  initialFamiliarity: InitialFamiliarity
}

export interface QueueParams {
  now: number
  newCardQuota: number   // M，单位是**词**：本轮最多引入几个新词；0 = 只还旧账
  queueLimit: number     // L，单位是**卡**：本轮最多出几张；0 = 不限
  /** 自由练习：熟词不看 due_at，一律进到期池（仍按 R_now 升序 = 最记不住的最先）。默认关闭。 */
  includeNotDue?: boolean
}

export interface QueueResult {
  queue: QueueCandidate[]
  dueCount: number
  newCount: number
}

/** 词的当前可回忆概率（排序依据）。新卡走熟悉度冷启动映射。 */
function rNow(c: QueueCandidate, now: number): number {
  if (c.stability === null) return NEW_CARD_RNOW[c.initialFamiliarity]
  return retrievability(c.stability, elapsedDaysSince(c.lastReviewAt, now))
}

/**
 * 每词每轮至多一张卡（01 §4.4.3 步 3）：按已排好的顺序，每个词只保留第一张。
 * 输入必须已按 R_now 升序——保留的就是该词「最记不住」的那张。
 */
function onePerWord(sorted: QueueCandidate[]): QueueCandidate[] {
  const seen = new Set<string>()
  const out: QueueCandidate[] = []
  for (const c of sorted) {
    if (seen.has(c.wordId)) continue
    seen.add(c.wordId)
    out.push(c)
  }
  return out
}

/**
 * 组卷流水线（spec 4.11）：
 *   1. 分池：到期（stability 非空且到期 / includeNotDue 时全部熟卡）与新卡
 *   2. 各池按 R_now 升序，再按词去重 → 每词每轮至多一张
 *   3. 新词额度按**词**算：取前 M 个词
 *   4. 到期优先：同一个词若本轮已出到期卡，它的新卡推迟到下一轮
 *   5. 回合上限按**卡**算：新卡先占，到期卡填剩下的
 *
 * 「按词算额度 + 每词一张」的必然结果：一个有 3 个题型的词会连续三轮各占一次新词额度，
 * 直到所有题型都评过。这不是缺陷，是「每天接触 N 个新词」与「同一词不在同一轮重复」叠加的结果。
 */
export function buildQueue(candidates: QueueCandidate[], params: QueueParams): QueueResult {
  const { now, newCardQuota, queueLimit, includeNotDue } = params

  const isNew = (c: QueueCandidate) => c.stability === null
  const byRNow = (a: QueueCandidate, b: QueueCandidate) => rNow(a, now) - rNow(b, now)

  const dueSorted = onePerWord(
    candidates.filter(c => !isNew(c) && (includeNotDue || c.dueAt <= now)).sort(byRNow))
  const freshSorted = onePerWord(
    candidates.filter(isNew).sort((a, b) => a.initialFamiliarity - b.initialFamiliarity))

  const freshRoom = queueLimit === 0 ? newCardQuota : Math.min(newCardQuota, queueLimit)
  const freshTakeRaw = newCardQuota === 0 ? [] : freshSorted.slice(0, freshRoom)

  // 判据用 dueSorted 而不是 dueTake：dueTake 的长度依赖 freshTake，反过来用会绕成循环。
  // 保守一点（把本轮没排上的到期词也算作「本轮已处理」）不会出错——那些词的卡下一轮还在。
  const dueWordIds = new Set(dueSorted.map(c => c.wordId))
  const freshTake = freshTakeRaw.filter(c => !dueWordIds.has(c.wordId))

  const dueRoom = queueLimit === 0 ? Infinity : Math.max(0, queueLimit - freshTake.length)
  const dueTake = dueSorted.slice(0, dueRoom)

  const queue = [...dueTake, ...freshTake].sort(byRNow)
  return { queue, dueCount: dueTake.length, newCount: freshTake.length }
}
