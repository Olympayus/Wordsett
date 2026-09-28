import type { InitialFamiliarity } from './types'

const MS_PER_DAY = 86_400_000
const DISPLAY_HORIZON_DAYS = 7

/** 展示用掌握度：固定视野 7 天的可回忆概率。S 为 null（未首评）时返回 null。 */
export function mastery(stability: number | null): number | null {
  if (stability === null || stability <= 0) return null
  return clamp01(Math.exp(-DISPLAY_HORIZON_DAYS / stability))
}

/** 排序用当前可回忆概率：按实际已过天数计算。逾期越久越小。 */
export function retrievability(stability: number | null, elapsedDays: number): number {
  if (stability === null || stability <= 0) return 0
  return clamp01(Math.exp(-Math.max(0, elapsedDays) / stability))
}

/** 距上次复习的已过天数；未复习返回 0；时钟回拨 clamp 到 0。 */
export function elapsedDaysSince(lastReviewAt: number | null, now: number): number {
  if (lastReviewAt === null) return 0
  return Math.max(0, (now - lastReviewAt) / MS_PER_DAY)
}

/** 新卡（未首评）的 R_now 冷启动映射：完全陌生 / 眼熟 / 认识。 */
export const NEW_CARD_RNOW: Record<InitialFamiliarity, number> = { 1: 0.15, 2: 0.45, 3: 0.75 }

// 分档阈值：3 个阈值切出 4 档（+ 无记录为第 0 档，共 5 档）。
// 反解 exp(-7/S) = t 得 S = 7 / −ln(t)，故三档约对应 S = 10.1 / 19.6 / 43.1 天
const TIER_THRESHOLDS = [0.5, 0.7, 0.85]

/** 掌握度分档：0 = 无记录，1 最弱 → 4 最熟。 */
export function masteryTier(m: number | null): 0 | 1 | 2 | 3 | 4 {
  if (m === null) return 0
  let tier = 1
  for (const t of TIER_THRESHOLDS) if (m >= t) tier++
  return tier as 1 | 2 | 3 | 4
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

/**
 * 首评三键的默认聚焦键（spec 4.6；出题依据 01 §3.7）。
 *
 * 只有**未首评**的卡才有默认值——已复习过的卡，它的下一次评分该由上一轮的间隔与
 * 你的记忆状态决定，预填一个「眼熟」反倒是在替你作答。
 *
 * 判据必须是 stability 而不是 sched.reps：reps 在 assembleCardDTO 里是硬编码 0，
 * 拿它判「是否新卡」会把每一张卡都判成新卡。
 *
 * 语义边界：这是**视觉默认态**，不是自动评分。用户仍须按键确认——§3.7 的立论根基
 * 就是「三键确认是防误评的根基」，预填省的是目光移动，不省按键确认。
 */
export function defaultRatingFor(input: {
  stability: number | null
  initialFamiliarity: InitialFamiliarity
}): 1 | 2 | 3 | null {
  if (input.stability !== null) return null
  const f = input.initialFamiliarity
  return f === 2 ? 2 : f === 3 ? 3 : 1
}
