import type { FreeScopeKind, ReviewStrategy, Template } from './types'

/**
 * 控制台「范围」那一行的中文名（v0.6.2 条目 15；v0.6.3 条目 2 把行的标签从「本次范畴」改成「范围」）。
 * 控制台与自由练习的标签页标题共用这一处，免得同一个范围在两处写成两个名字。
 */
export function scopeLabel(strategy: ReviewStrategy, scope: FreeScopeKind | null): string {
  // 今日复习策略没有范围概念，直接给策略名
  if (strategy === 'today') return '今日复习'
  if (scope === null) return '自由练习'
  return FREE_SCOPE_LABEL[scope]
}

/** 自由练习四个范围的中文名。`FreeScopeTabs` 的 `SCOPE_TABS` 与 `FreeScopePanel` 的标题都引这里（v0.6.2 条目 17），三处同一个名字。 */
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

/**
 * 评分档位的中文标签。复习区有两处要显示它：ReviewArena 的回看态
 * 「本题评分：X」与本轮小结明细表的「记忆评分」列。
 *
 * 两处原先各抄一份，注释还写「与另一处同源」——抄的本就不是源，注释只会把找源的人引到
 * 一份复制品上。放在这里是因为本文件已经是复习区的中文标签堆（FREE_SCOPE_LABEL 在隔壁），
 * 而 rating 的档位与 scope 的档位是同一类东西。加档位只改这一处。
 *
 * 4（轻松）是预留档，数据层已算「记得」（见上面的 correctCount），本期没有 UI。
 */
export const RATING_LABELS: Record<number, string> = { 1: '忘了', 2: '模糊', 3: '记得', 4: '轻松' }

/**
 * 题型中文名（v0.6.3 条目 2 从 roundStats 迁来）。
 *
 * **这份表全仓只有这一处**——`template.ts` 导出的是顺序与依赖，不含中文名。
 * 与 `FREE_SCOPE_LABEL` / `RATING_LABELS` 放在一起：面向用户的标签表都住在这个文件，
 * 别处没有第二份可以漏改。
 */
export const TEMPLATE_LABEL: Record<Template, string> = {
  recognize: '认读',
  cloze: '填空',
  recall: '中译英',
  english_def: '英文释义题',
  listen: '听辨',
}

/** 题面上方的题型标签（v0.6.3 条目 18）。前缀与全角冒号都在这里，组件不拼字符串。 */
export function promptTypeLabel(t: Template): string {
  return `题型：${TEMPLATE_LABEL[t]}`
}

/**
 * 释义右侧的词性括号（v0.6.3 条目 3）。前导空格在这里，调用方直接内联在释义后。
 *
 * 空串返回空串——调用方据此决定不渲染，而不是渲染一对空括号。
 * 不去重已有的括号（YAGNI）：数据层的 part_of_speech 不带括号，多一层判断是给不存在的输入写代码。
 */
export function posNoteText(pos: string): string {
  return pos ? ` (${pos})` : ''
}
