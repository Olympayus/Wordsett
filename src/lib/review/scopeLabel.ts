import type { FreeScopeKind, ReviewStrategy } from './types'

/**
 * 「本次范畴」的中文名（v0.6.2 条目 15）。控制台与自由练习的标签页标题共用这一处，
 * 免得同一个范围在两处写成两个名字。
 */
export function scopeLabel(strategy: ReviewStrategy, scope: FreeScopeKind | null): string {
  // 今日复习策略没有范围概念，直接给策略名
  if (strategy === 'today') return '今日复习'
  if (scope === null) return '自由练习'
  return FREE_SCOPE_LABEL[scope]
}

/** Task 13 起与 `FreeScopeTabs` 的 `SCOPE_TABS` 同源（该文件现仍写死「某个分类」，本表在 v0.6.2 统一两处）。 */
export const FREE_SCOPE_LABEL: Record<FreeScopeKind, string> = {
  category: '分类强化',
  weak: '薄弱词专项',
  today: '今日队列重练',
  random: '全库随机',
}

/**
 * 控制台的正确率文案（v0.6.2 §4.1）。已答 0 时返回 `—`——
 * 0/0 是未定义，写成 0% 会被用户读成「全错了」（Review Focus 2）。
 */
export function accuracyText(answeredCount: number, correctCount: number): string {
  if (answeredCount <= 0) return '—'
  return `${Math.round((correctCount / answeredCount) * 100)}%`
}

/**
 * 控制台的正确数（spec §8.1）。判据 `rating >= 3` 与 `template.ts` 的 `templateAccuracy`
 * 同一处（那里也是 `>= 3`，并注明 Good/Easy 都算对）。
 *
 * 用 `>= 3` 而非 `=== 3` 是刻意的：rating 4（轻松）在数据层已算「记得」，只是还没有 UI。
 * 写成 `=== 3` 会让将来 4 分档一上线，这行数字就无声地少算。
 *
 * 抽成函数而非留在 `ReviewModule` 里内联 filter：仓库没有组件测试 harness，
 * 内联的判据无从断言——spec §8.1 点的正是这一条。
 */
export function correctCount(answered: { rating: number }[]): number {
  return answered.filter(a => a.rating >= 3).length
}
