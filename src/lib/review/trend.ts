/**
 * 近 14 天趋势条的算术（spec §3.6、§8.1-5）。原先内联在 OverviewPanel 的 TrendBar 里，
 * 抽出来是为了让「口径」有 Vitest 覆盖——口径本身是验收项，藏在组件里就等于没钉。
 */

/** 单日评分计数。字段与 db 层 getStats 的 recentRatings 同形（day / again / hard / good）。 */
export interface DayRating {
  day: string
  again: number
  hard: number
  good: number
}

/**
 * 当日复习量＝again + hard + good。
 * rating 4（预留的「轻松」档）在数据层就折进了 good（db/review.ts 的 else 分支），
 * 所以这里三项相加即全部评分数，不漏档。
 */
export function dayTotal(d: DayRating): number {
  return d.again + d.hard + d.good
}

/**
 * 当日正确率＝good / 总评分数。与 templateAccuracy 的「rating ≥ 3 算对」同口径：
 * good 恰好收下 rating ≥ 3（4 折入 good，3 落 good），分母是全部评分数。
 * 空日返回 0（调用方只画有评分的日子，但保底口径写死在这里，免得分支各自发挥）。
 */
export function dayAccuracy(d: DayRating): number {
  const n = dayTotal(d)
  return n > 0 ? d.good / n : 0
}

/**
 * 稀疏判定：评分样本 < 3 天**且**未来 8 日无一到期时视为「数据积累中」。
 * 全四宫格只判这一次（v0.6.2 条目 9 之前，StatsMini 的三张图与 OverviewPanel 的 TrendBar
 * 各自判一次，于是同一个库会在上面画着曲线、下面写着「数据积累中」；现在趋势已并入四宫格，
 * 两个容器只剩一个，这条判据随之成为 spec §4.2 要求的「稀疏态四张占位卡同样 2×2」的唯一开关，
 * 改动前先想清楚四张卡会不会因此一起消失。
 */
export function isTrendSparse(recentRatings: DayRating[], dueByDay: number[]): boolean {
  return recentRatings.length < 3 && dueByDay.every(n => n === 0)
}

/**
 * 补充文字只需要这三个字段。用结构化参数而不是 import StatsMini 的 ReviewStats——
 * 后者会让 trend ← StatsMini 与 StatsMini → trend 成环；结构相同的类型在 TS 里可直接传。
 */
export interface RoundStatsInput {
  masteryBuckets: number[]
  dueByDay: number[]
  recentRatings: DayRating[]
}

/**
 * 四宫格卡片的补充文字（v0.6.2 条目 9）。小图上读不准的数写死在卡面下方，
 * 不再只靠 hover tooltip——触控板上 tooltip 等于没有。
 */
export function subtitleFor(kind: 'rating' | 'due' | 'mastery' | 'trend', stats: RoundStatsInput): string {
  switch (kind) {
    case 'rating': {
      const total = stats.recentRatings.reduce((n, r) => n + dayTotal(r), 0)
      if (total === 0) return '近 14 天还没有评分记录'
      // 权重与 RatingSpark 的纵轴刻意相同（again=0、hard=0.5、good=1）：图与文字讲的是同一件事，
      // 改权重必须两处一起改。但归一化基准**不同**——图除以最忙的一天，这里除以量表本身（1.0），
      // 所以数字不随哪天最忙而变。
      const weighted = stats.recentRatings.reduce((n, r) => n + (r.good + r.hard * 0.5), 0)
      return `合计 ${total} 张，均值 ${(weighted / total).toFixed(1)}`
    }
    case 'due': {
      // dueByDay[0] 是今天，未来 7 天从索引 1 起
      const future = stats.dueByDay.slice(1, 8)
      const sum = future.reduce((a, b) => a + b, 0)
      if (sum === 0) return '未来 7 天没有到期的卡'
      const peak = Math.max(...future)
      return `共 ${sum} 张，峰值在第 ${future.indexOf(peak) + 1} 天`
    }
    case 'mastery': {
      const total = stats.masteryBuckets.reduce((a, b) => a + b, 0)
      if (total === 0) return '全库还没有词'
      // 后三档（索引 2、3、4）算「熟悉及以上」
      const familiar = stats.masteryBuckets.slice(2).reduce((a, b) => a + b, 0)
      return `全库词汇数: ${total}　熟悉及以上: ${familiar}　熟悉度: ${Math.round((familiar / total) * 100)}%`
    }
    case 'trend': {
      const total = stats.recentRatings.reduce((n, r) => n + dayTotal(r), 0)
      if (total === 0) return '近 14 天还没有复习记录'
      // 按当日复习量加权，不能对每日正确率取简单平均——那会让只有 1 张的日子
      // 与有 20 张的日子等权。
      const accSum = stats.recentRatings.reduce((n, r) => n + dayAccuracy(r) * dayTotal(r), 0)
      return `合计: ${total} 张 · 平均正确率: ${Math.round((accSum / total) * 100)}%`
    }
  }
}

/**
 * 卡头的期间小字（v0.6.3 条目 7：从卡底补充文字里搬到卡头右上角）。
 *
 * 单独一个函数而不是从 subtitleFor 里切字符串：那是拿渲染结果反推结构，改一个标点就断。
 * 四个 kind 与 StatsMini 的 CARDS 表同源。
 * 「熟知度分布」没有期间（它是全库快照，不是时间窗），返回空串由调用方决定不渲染。
 */
export function periodFor(kind: 'rating' | 'due' | 'mastery' | 'trend'): string {
  switch (kind) {
    case 'rating': return '近 14 天评分走势'
    case 'due': return '未来 7 天到期'
    case 'mastery': return ''
    case 'trend': return '近 14 天'
  }
}

/**
 * 把补充文字里的数字串切出来（v0.6.3 条目 7），供前端把数字段包上 .stat-num。
 *
 * 切分放在趋势算术这一层、而不是组件里，是因为「哪个子串算数字」是一条口径
 * （含小数、含 %），它需要用例钉住；组件只消费结果、不重写正则。
 *
 * 空串返回空数组——调用方据此不渲染那一行，而不是渲染一个空 span。
 */
export function splitCaptionNumbers(text: string): { text: string; isNum: boolean }[] {
  if (text === '') return []
  // 用**正则复判**而不是依赖 split 捕获组的奇偶下标：filter 会打乱下标，
  // 而「这一串看起来是不是数字」本来就是可以直接判定的。
  return text.split(/(\d+(?:\.\d+)?%?)/).filter(s => s !== '').map(s => ({ text: s, isNum: /^\d+(?:\.\d+)?%?$/.test(s) }))
}

/**
 * 时间轴端点刻度上的短日期（v0.6.3 条目 7，spec §7.4 的「如 08-27 / 09-09」）。
 *
 * 数据的 day 是 db/review.ts 的 `date(reviewed_at/1000,'unixepoch','localtime')`，
 * 也就是 10 字符的 YYYY-MM-DD——10 字符的等宽字在约 282px 的卡里一侧就占掉 57px，
 * 远超刻度该有的分量。这里只做展示截断，不改 day 的产出，也不改 day 的其他用法
 * （TrendBars 的 title、key 仍用原串），故这个函数只被 ChartFrame 的两个刻度调用。
 *
 * 短于等于 5 字符（空串、已经是 MM-DD）原样返回：早先的 brief 以为 day 已经是 MM-DD，
 * 于是刻度直接渲染了 10 字符。把这个分支钉住，短形态将来由谁产出都不会被截成 `-14-`。
 */
export function shortDay(day: string | undefined): string {
  if (!day) return ''
  return day.length > 5 ? day.slice(-5) : day
}
