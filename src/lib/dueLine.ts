import type { WordLocation } from '../types/word'

/**
 * 复习调度行的状态（v0.7.9 划词收录的「已在库」态）。
 *
 * 口径见 spec §11.11：只算工作区词、只算未挂起卡、最早到期的一张说了算；
 * 储藏库词一律 `archived`；没有行或全部挂起是 `none`。
 */
export type WordDueStatus =
  | { kind: 'overdue'; days: number }
  | { kind: 'dueToday'; cards: number }
  | { kind: 'upcoming'; days: number }
  | { kind: 'none' }
  | { kind: 'archived' }

/** 调度行文案的唯一出处：五种状态各一句。 */
export function dueLine(s: WordDueStatus): string {
  switch (s.kind) {
    case 'overdue': return `已逾期 ${s.days} 天`
    case 'dueToday': return `今日到期 · 到期卡 ${s.cards} 张`
    case 'upcoming': return `${s.days} 天后到期`
    case 'none': return '尚无复习计划'
    case 'archived': return '储藏库 · 不参与复习'
  }
}

/** 本地午夜时间戳（`new Date(y, m, d)` 走本地时区）。 */
function localMidnight(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** 两个时间戳之间跨过的本地午夜数（按日历日算，不受夏令时 23/25 小时日影响）。 */
function localDayDiff(from: number, to: number): number {
  return Math.round((localMidnight(to) - localMidnight(from)) / 86400000)
}

/**
 * 纯映射：db 行 → 调度状态。`location` 为 null（尚不知道归属）按工作区处理。
 * 逾期天数按**本地午夜边界**计算整天数。逾期准入也以本地午夜为界：
 * `[今天 0 点, 明天 0 点)` 内到期的卡（哪怕钟点已过）都算「今日到期」，
 * 与 DueBadge 的「今日待复习」同一口径；今日到期统计次日 0 点前到期的未挂起卡。
 */
export function dueStatusFrom(
  rows: { dueAt: number; suspended: boolean }[],
  now: number,
  location: WordLocation | null,
): WordDueStatus {
  if (location === 'archive') return { kind: 'archived' }
  const active = rows.filter(r => !r.suspended)
  if (active.length === 0) return { kind: 'none' }

  let earliest = active[0].dueAt
  for (const r of active) if (r.dueAt < earliest) earliest = r.dueAt

  if (earliest < localMidnight(now)) {
    return { kind: 'overdue', days: localDayDiff(earliest, now) }
  }

  const d = new Date(now)
  const nextMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
  if (earliest < nextMidnight) {
    return { kind: 'dueToday', cards: active.filter(r => r.dueAt < nextMidnight).length }
  }
  return { kind: 'upcoming', days: localDayDiff(now, earliest) }
}
