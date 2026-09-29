import type { WordWithPreview } from '../types/word'
import type { WordReviewOverlay } from '../db/review'
import type { IconName } from '../components/icons'
import { isLeech } from './review/leech'

export type SmartViewKey = 'all' | 'due' | 'weekNew' | 'leech'

/** 显示顺序即数组顺序。 */
export const SMART_VIEW_ORDER: SmartViewKey[] = ['all', 'due', 'weekNew', 'leech']

export const SMART_VIEW_META: Record<SmartViewKey, { label: string; icon: IconName }> = {
  all:     { label: '完整词库', icon: 'library' },
  due:     { label: '复习到期', icon: 'calendar' },
  weekNew: { label: '本周新增', icon: 'sprout' },
  leech:   { label: '顽固词',   icon: 'alert' },
}

/** 不可关闭的视图：它就是「没有视图激活」那个状态本身，关掉之后没有可回退的落点。 */
export const LOCKED_SMART_VIEW: SmartViewKey = 'all'

/** 「本周新增」的窗口：滚动 7 天，不是自然周（03 §3.1 的措辞是「近 7 天收录」）。 */
export const WEEK_MS = 7 * 86_400_000

export interface SmartViewInput {
  words: WordWithPreview[]
  /** 今日「到期且可出题」的词 id 集合——与复习控制台同一个数（Plan A Task 9）。 */
  dueWordIds: Set<string>
  overlay: Record<string, WordReviewOverlay>
  leechThreshold: number
  now: number
}

/** 开关筛选后的可见视图列表。 */
export function visibleSmartViews(enabled: Record<SmartViewKey, boolean>): SmartViewKey[] {
  return SMART_VIEW_ORDER.filter(k => k === LOCKED_SMART_VIEW || enabled[k])
}

/** 视图是**附加**筛选条件——在与筛选框的结果之上再过滤一层。 */
export function filterBySmartView(
  words: WordWithPreview[],
  key: SmartViewKey,
  input: SmartViewInput,
): WordWithPreview[] {
  switch (key) {
    case 'all':
      return words
    case 'due':
      return words.filter(w => input.dueWordIds.has(w.id))
    case 'weekNew':
      return words.filter(w => input.now - w.createdAt <= WEEK_MS)
    case 'leech':
      return words.filter(w => {
        const o = input.overlay[w.id]
        return o ? isLeech(o.maxLapses, input.leechThreshold) : false
      })
  }
}

export function smartViewCount(key: SmartViewKey, input: SmartViewInput): number {
  return filterBySmartView(input.words, key, input).length
}
