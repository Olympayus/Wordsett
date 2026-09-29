import type { InitialFamiliarity } from './types'
import { displayTier, strengthScore } from './mastery'

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

export interface MasteryTooltipModel {
  score: number | null
  tier: 0 | 1 | 2 | 3 | 4 | 5
  tierName: string
}

/**
 * 浮层顶部那行「分值 / 100 · 档位名」的模型（v0.6.5）。抽成纯函数是为了可测——
 * vitest 跑在 node 环境、测不到 DOM，组件只能把可判定的部分导出成这样一支函数。
 *
 * 空档不报百分比：没有数可报，报 0 会被读成「最弱」。这条由原先的一行式
 * `masteryTooltip()` 立下，本函数接手时原样保留。
 *
 * 放这里而不是 StrengthChip.tsx：浮层由 chip 引用，模型函数若反过来住在 chip 里，
 * 就成了 StrengthChip → WordMasteryTooltip → StrengthChip 的循环导入。本文件是两者
 * 的共同上游（不 import 任何组件），两条边都是单向的。
 */
export function masteryTooltipModel(input: {
  weakestStability: number | null
  familiarity: InitialFamiliarity
}): MasteryTooltipModel {
  const tier = displayTier({ stability: input.weakestStability, familiarity: input.familiarity })
  return { score: strengthScore(input.weakestStability), tier, tierName: MASTERY_TIER_NAMES[tier] }
}
