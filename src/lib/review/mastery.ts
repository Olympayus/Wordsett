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

/**
 * 记忆强度分（0–100）＝「S 天稳定性下，7 天后还记得的概率」×100。
 *
 * 复用了 mastery() 而不是另造映射——设计稿 §5.1 说的「stability 经非线性映射归一到
 * 0–100」正是这条：100·(1−e^(−7/S)) 与 100·exp(−7/S) 同源。
 *
 * 已知形状：涨得极快又很快压平，S=20 天已 70 分、S=60 天 89 分，**100 分取不到**
 * （上确界是 100，任何有限 S 都够不着）。这是「还记得的概率」的固有形状，接受；
 * 换 100·S/(S+20) 会更平缓，但那样数字就不再有概率含义（spec 4.5）。
 */
export function strengthScore(stability: number | null): number | null {
  const m = mastery(stability)
  return m === null ? null : Math.round(m * 100)
}

// 四道分档线切出 5 个非空档（+ 档 0 无记录，共 6 档）。20% 一段，对齐 V8 原型 M4。
const TIER_CUTS = [20, 40, 60, 80]

/** 记忆强度档位：0 = 空档（无记录），1 最弱 → 5 最强。 */
export function masteryTier(stability: number | null): 0 | 1 | 2 | 3 | 4 | 5 {
  const s = strengthScore(stability)
  if (s === null) return 0
  let tier = 1
  for (const cut of TIER_CUTS) if (s >= cut) tier++
  return tier as 1 | 2 | 3 | 4 | 5
}

/**
 * 冷启动（spec 4.5 / 03 §3.3）：该词还没复习过时，用收录时用户自报的熟悉度给一个
 * 非中性档——「无记录 → 第一个非中性值」正是设计稿要的效果。
 *
 * 最低非中性档就是 1，所以完全陌生 → 档 1、眼熟 → 档 2、认识 → 档 3。
 */
export function familiarityTier(f: InitialFamiliarity): 1 | 2 | 3 {
  return f === 2 ? 2 : f === 3 ? 3 : 1
}

/** 展示用档位：有复习记录以 FSRS 为准，没有才回落到熟悉度。 */
export function displayTier(input: { stability: number | null; familiarity: InitialFamiliarity }): 0 | 1 | 2 | 3 | 4 | 5 {
  if (input.stability === null) return familiarityTier(input.familiarity)
  return masteryTier(input.stability)
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

/**
 * 首评三键的默认键（spec 4.6；出题依据 01 §3.7）。
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
