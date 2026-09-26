import type { Template } from './types'
import { TEMPLATE_DIFFICULTY } from './template'
import type { ReviewCardDTO } from '../../services/reviewService'
import type { AnsweredEntry } from '../../stores/reviewSessionStore'

/**
 * 本轮小结的取数（v0.6.2 条目 18）。
 *
 * 四张图是复习首页四图的「本轮变体」：首页的「明日压力」（未来 7 天到期）与
 * 「近 14 天趋势」（14 天历史）都是全库量，本轮没有对应值，故换位成
 * 「本轮题型构成」与「本轮题型正确率」。四张图都不需要新增状态——
 * queue 给构型，answered 的 rating + template 给走势、分布与正确率。
 */

/**
 * 题型中文名。**这份表全仓只有这一处**——`template.ts` 导出的是顺序与依赖，不含中文名。
 * 所以要加题型或改中文名时，改这一处即可，别处没有第二份可以漏改。
 */
const TEMPLATE_LABEL: Record<Template, string> = {
  recognize: '认读',
  cloze: '填空',
  recall: '中译英',
  english_def: '英文释义题',
  listen: '听辨',
}

export interface RoundSummary {
  /** 本轮队列长度＝分母。答题行与用时行都要报它，否则「已答 3」读不出本轮多大。 */
  total: number
  answeredCount: number
  correctCount: number
  /** 已答 0 时为 `—`（0/0 未定义，不是 0%） */
  accuracy: string
  skippedCount: number
}

export function roundSummary(queue: ReviewCardDTO[], answered: AnsweredEntry[]): RoundSummary {
  const correctCount = answered.filter(a => a.rating >= 3).length
  return {
    // 分母是队列长度而非已答数：未作答的题仍属于本轮（v0.6.1 起如此，未作答计入总分母）
    total: queue.length,
    answeredCount: answered.length,
    correctCount,
    accuracy: answered.length > 0 ? `${Math.round((correctCount / answered.length) * 100)}%` : '—',
    skippedCount: answered.filter(isSkipped).length,
  }
}

/**
 * 跳过＝按了「跳过」键：`rating === 1` 且没留下作答原文。
 *
 * 判据只认 rating 1，**不能只看 input 为空**——揭示型题（中译英 / 英文释义题）的「揭示答案」
 * 键提交的也是空串（见 AnswerInput 的 reveal 分支），用户是揭示后正常评分的。
 * 只看 input 会让每张 english_def 都自称「（跳过）」，与统计段的跳过张数对不上。
 */
export function isSkipped(entry: { rating: number; input: string }): boolean {
  return entry.rating === 1 && entry.input === ''
}

export function templateCounts(queue: ReviewCardDTO[]): { template: Template; label: string; count: number }[] {
  return TEMPLATE_DIFFICULTY.map(t => ({
    template: t,
    label: TEMPLATE_LABEL[t],
    count: queue.filter(c => c.template === t).length,
  }))
}

export function templateAccuracy(answered: AnsweredEntry[]): { template: Template; label: string; count: number; accuracy: number | null }[] {
  return TEMPLATE_DIFFICULTY.map(t => {
    const rows = answered.filter(a => a.template === t)
    return {
      template: t,
      label: TEMPLATE_LABEL[t],
      count: rows.length,
      // 未出到的题型是 null（显示「—」），出的题全错才是 0（显示 0%）
      accuracy: rows.length > 0 ? rows.filter(a => a.rating >= 3).length / rows.length : null,
    }
  })
}

export function ratingDistribution(answered: AnsweredEntry[]): { again: number; hard: number; good: number } {
  return {
    again: answered.filter(a => a.rating === 1).length,
    hard: answered.filter(a => a.rating === 2).length,
    good: answered.filter(a => a.rating >= 3).length,
  }
}

/** 按作答顺序的三级评分序列。纵轴固定 1..3，故两次「全记得」与「全忘了」画出来不同。 */
export function ratingSeries(answered: AnsweredEntry[]): number[] {
  return answered.map(a => a.rating)
}

/**
 * 逐题明细里那一行的词。取值顺序与 SummaryPanel 原有的 wrongLabel 一致：
 * 题面的词 → 答案里的词 → 答案释义 → cardId 兜底。
 * 空串与纯空白都算「没有」，继续往下找（Review Focus 4）。
 */
export function wordLabelFor(card: ReviewCardDTO): string {
  const p = card.prompt as Record<string, unknown>
  const a = card.answer as Record<string, unknown>
  const pick = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
  for (const v of [p.lemma, a.lemma, a.translation]) {
    if (pick(v).trim() !== '') return pick(v)
  }
  return card.cardId
}
