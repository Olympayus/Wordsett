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
 * 稀疏判定：与三枚迷你图（StatsMini）同一条——评分样本 < 3 天**且**未来 8 日无一到期时
 * 视为「数据积累中」。两张卡各自判一次稀疏，加一个 14 天窗口内 0 评分的库，
 * 就会出现「上面画着曲线、下面写着数据积累中」的自相矛盾（spec §3.6 要求兜底一致）。
 */
export function isTrendSparse(recentRatings: DayRating[], dueByDay: number[]): boolean {
  return recentRatings.length < 3 && dueByDay.every(n => n === 0)
}
