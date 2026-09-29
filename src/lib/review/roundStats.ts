import type { Template } from './types'
import { TEMPLATE_DIFFICULTY } from './template'
import { TEMPLATE_LABEL } from './scopeLabel'
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

export interface RoundSummary {
  /** 本轮队列长度＝分母。「已答 n」读不出本轮多大，队列长度是唯一的对照。 */
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
 * 跳过＝按了「跳过」键，由调用方显式标记（v0.6.4 修正）。
 *
 * 旧判据是 `rating === 1 && input === ''`，那是从空串**反推意图**：input 是作答内容，
 * 任何「没打字就评分」的路径都会给出同一个空串，于是揭示型题（作答原文恒为空）的
 * 「揭示后评了忘了」被误标成跳过。v0.6.4 起改由调用方在跳过路径上显式置位。
 *
 * 入参只留 `skipped`：函数体既不读 rating 也不读 input，这两个必填字段是纯仪式。
 * 收窄它换来的是 answerDisplay 能直接委托过来（它手上只有 input + skipped，没有 rating）——
 * **判据只此一份**，本函数与文案函数之间不能再各写一遍 `skipped === true`，那正是本任务
 * 要消掉的那类漂（同 correctnessLabel 抽取的理由）。放宽入参不会拒掉任何既有调用方。
 */
export function isSkipped(entry: { skipped?: boolean }): boolean {
  return entry.skipped === true
}

/**
 * 「你的作答」列/行的文案（v0.6.4）。抽出来是因为同一份文案有两处消费点——
 * 小结的逐题明细与结果区的作答行。两处各写一份时必然漂（同 correctnessLabel 的先例）。
 *
 * 「（揭示后评分）」这一支已删：v0.6.4 起英释义题改成键入型，不再有揭示型题。
 */
export function answerDisplay(entry: { input: string; skipped?: boolean }): string {
  if (entry.input) return entry.input
  return isSkipped(entry) ? '（跳过）' : '（未作答）'
}

/**
 * 「正误」的说法（v0.6.3 条目 17）：错误写「错误」不写「不正确」。
 *
 * 抽出来是因为同一份文案有两处消费点——ResultBlock 的作答行与 SummaryPanel 的明细表列。
 * 两处各写一份时，「不正确」就是从这里漏出去的：改了明细表、忘了作答行。
 */
export function correctnessLabel(ok: boolean | null): string {
  return ok === null ? '—' : ok ? '正确' : '错误'
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

/** 评分分布。注意**跳过计入「忘了」**（数据层跳过就是 rating=1），
 *  与 skippedCount 是两个量，两者会同时加一，这是对的。 */
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
