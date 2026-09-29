/**
 * 记忆强度色阶的唯一出处（v0.6.4）。
 *
 * 色值取自 V8 原型的 TIER_COLORS——档 0 是暖调中性色 #d8d2c4，与全局米白底色同族，
 * 读起来是「空格」而不是「最浅的一档」。原先把这套色硬编码在 StatsMini 的
 * 熟知度分布图里，现在提出来自成一处：色块与图表必须同一套色，否则同一个词在两处
 * 显示不同的深浅。这与 trend.ts 抽 isTrendSparse 是同一个理由。
 *
 * 索引 = 档位（0 空档 … 5 熟知）。
 *
 * `as const` 把它钉成 6 元只读元组而不是 `string[]`：这两个数组的长度是**承重**的
 * ——少一档图表就少一段、色块与档位整体错位，而 `string[]` 允许任何长度，改短了
 * 类型检查一声不吭。这正是本次发版里七处过期的 `masteryBuckets` 字面量能一路藏
 * 下来的同一种洞（那个数组的 `number[]` 是 plan 定的既有形状，未动）。要改档数
 * 就得连同 TIER_CUTS 一起改，并让类型在这里先报出来。
 */
export const MASTERY_COLORS = ['#d8d2c4', '#c9d3dc', '#a9bcca', '#8aa7c3', '#6b8dad', '#527393'] as const

/** 记忆强度指示的格子总数（档 0 = 一格不填，故 6 档只用 5 格）。 */
export const MASTERY_BLOCKS = 5

/** 「记忆强度 ▮▮▮▯▯」的填格数。 */
export function masteryBlocks(tier: 0 | 1 | 2 | 3 | 4 | 5): { filled: number; total: number } {
  return { filled: Math.min(tier, MASTERY_BLOCKS), total: MASTERY_BLOCKS }
}

/** 档位中文名。`as const` 的理由同 MASTERY_COLORS：长度承重，且 chip 与图表坐标轴
 *  都从这里取，索引越界会直接读成 undefined 并渲染到界面上。 */
export const MASTERY_TIER_NAMES = ['无记录', '陌生', '初识', '巩固', '熟练', '熟知'] as const

/** 悬停详情文案；空档不报百分比（没有数可报，报 0 会被读成「最弱」）。 */
export function masteryTooltip(score: number | null, tier: 0 | 1 | 2 | 3 | 4 | 5): string {
  if (score === null) return '无调度记录'
  return `记忆强度 ${score} / 100 · ${MASTERY_TIER_NAMES[tier]}`
}
