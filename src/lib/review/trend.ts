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
      // 改权重必须两处一起改。但归一化基准**不同**——图除以最忙的一天（RatingSpark 的 max，
      // 目的是让 14 天的相对起伏看得出来），这里除以量表本身（1.0），所以数字不随哪天最忙而变。
      // 图上没有纵轴刻度，量表只能在这里说，字符串因此带上「满分 1」。
      const weighted = stats.recentRatings.reduce((n, r) => n + (r.good + r.hard * 0.5), 0)
      return `近 14 天评分走势 · 合计 ${total} 张 · 均值 ${(weighted / total).toFixed(1)}（满分 1）`
    }
    case 'due': {
      // dueByDay[0] 是今天，未来 7 天从索引 1 起
      const future = stats.dueByDay.slice(1, 8)
      const sum = future.reduce((a, b) => a + b, 0)
      if (sum === 0) return '未来 7 天没有到期的卡'
      const peak = Math.max(...future)
      return `未来 7 天到期 · 共 ${sum} 张 · 峰值在第 ${future.indexOf(peak) + 1} 天（${peak} 张）`
    }
    case 'mastery': {
      const total = stats.masteryBuckets.reduce((a, b) => a + b, 0)
      if (total === 0) return '全库还没有词'
      // 后三档（索引 2、3、4）算「熟悉及以上」
      const familiar = stats.masteryBuckets.slice(2).reduce((a, b) => a + b, 0)
      return `全库 ${total} 词 · 熟悉及以上 ${familiar} 词（${Math.round((familiar / total) * 100)}%）`
    }
    case 'trend': {
      const total = stats.recentRatings.reduce((n, r) => n + dayTotal(r), 0)
      if (total === 0) return '近 14 天还没有复习记录'
      // 按当日复习量加权，不能对每日正确率取简单平均——那会让只有 1 张的日子
      // 与有 20 张的日子等权。
      const accSum = stats.recentRatings.reduce((n, r) => n + dayAccuracy(r) * dayTotal(r), 0)
      return `近 14 天合计 ${total} 张 · 平均正确率 ${Math.round((accSum / total) * 100)}%`
    }
  }
}
