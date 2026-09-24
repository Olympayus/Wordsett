import { NEW_CARD_RNOW, elapsedDaysSince, retrievability } from './mastery'
import type { InitialFamiliarity, Template } from './types'

export interface QueueCandidate {
  cardId: string
  wordId: string
  stability: number | null      // null = 新卡未首评
  dueAt: number                 // 新卡无意义，传 0
  lastReviewAt: number | null
  initialFamiliarity: InitialFamiliarity
  availableTemplates: Template[]
}

export interface QueueParams {
  now: number
  newCardQuota: number   // M；0 = 只还旧账
  queueLimit: number     // L；0 = 不限
}

export interface QueueResult {
  queue: QueueCandidate[]
  dueCount: number
  newCount: number
  absentCount: number
}

/** 词的当前可回忆概率（排序依据）。新卡走熟悉度冷启动映射。 */
function rNow(c: QueueCandidate, now: number): number {
  if (c.stability === null) return NEW_CARD_RNOW[c.initialFamiliarity]
  return retrievability(c.stability, elapsedDaysSince(c.lastReviewAt, now))
}

/**
 * 组卷流水线（spec §3.5）：
 *   1. 词级可用性闸门：无任何可用模板 → 缺席
 *   2. 到期卡按 R_now 升序；新卡按熟悉度升序
 *   3. 额度：新卡取前 M，到期卡取前 (L − 实际新卡数)  —— 到期卡优先占位，不被新卡挤掉
 *   4. 合并后按 R_now 升序输出
 */
export function buildQueue(candidates: QueueCandidate[], params: QueueParams): QueueResult {
  const { now, newCardQuota, queueLimit } = params

  const usable = candidates.filter(c => c.availableTemplates.length > 0)
  const absentCount = candidates.length - usable.length

  const isNew = (c: QueueCandidate) => c.stability === null
  const due = usable.filter(c => !isNew(c) && c.dueAt <= now)
  const fresh = usable.filter(isNew)

  const dueSorted = [...due].sort((a, b) => rNow(a, now) - rNow(b, now))
  const freshSorted = [...fresh].sort((a, b) => a.initialFamiliarity - b.initialFamiliarity)

  const freshRoom = queueLimit === 0 ? newCardQuota : Math.min(newCardQuota, queueLimit)
  const newTake = newCardQuota === 0 ? [] : freshSorted.slice(0, freshRoom)

  const dueRoom = queueLimit === 0 ? Infinity : Math.max(0, queueLimit - newTake.length)
  const dueTake = dueSorted.slice(0, dueRoom)

  const queue = [...dueTake, ...newTake].sort((a, b) => rNow(a, now) - rNow(b, now))

  return { queue, dueCount: dueTake.length, newCount: newTake.length, absentCount }
}
