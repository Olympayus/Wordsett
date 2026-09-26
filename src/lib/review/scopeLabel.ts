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

/** 与 FreeScopeTabs.tsx 的 SCOPE_TABS 文案一致（「某个分类」在 v0.6.2 改名「分类强化」）。 */
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
