import { useCallback, useEffect, useState } from 'react'
import StrategyList, { type StrategyMeta } from './StrategyList'
import OverviewPanel from './OverviewPanel'
import FreeScopePanel from './FreeScopePanel'
import ReviewArena from './ReviewArena'
import SummaryPanel from './SummaryPanel'
import { useReviewSessionStore } from '../../stores/reviewSessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useCategoryStore } from '../../stores/categoryStore'
import { getStrategyCounts, getOverview, getQueue, REVIEW_DEFAULTS, type ReviewParams } from '../../services/reviewService'
import type { ReviewStrategy } from '../../lib/review/types'

export default function ReviewModule() {
  const { strategy, phase, queue, index, setStrategy, startSession, reset } = useReviewSessionStore()
  const reviewSettings = useSettingsStore(s => s.review)
  const categories = useCategoryStore(s => s.categories)
  const params: ReviewParams = { ...REVIEW_DEFAULTS, ...reviewSettings }

  const [counts, setCounts] = useState({ today: 0, weak: 0 })
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof getOverview>> | null>(null)

  const refresh = useCallback(async () => {
    setCounts(await getStrategyCounts(params))
    setOverview(await getOverview(params))
  }, [params.retention, params.leechThreshold, params.newCardQuota, params.queueLimit])

  useEffect(() => { refresh() }, [refresh, phase])

  // 会话进行中（非概览 / 非小结）：当前策略就地展开进度
  const live = phase === 'answering' || phase === 'rated'
  const progressFor = (key: ReviewStrategy) =>
    live && key === strategy && queue.length > 0
      ? { index, total: queue.length, template: queue[index]?.template ?? '' }
      : null

  const strategies: StrategyMeta[] = [
    { key: 'today', label: '今日复习', count: counts.today, hint: '到期 + 新词额度 · 计分', progress: progressFor('today') },
    { key: 'weak', label: '薄弱词专项', count: counts.weak, hint: `连错 ≥ ${params.leechThreshold} ∪ 近 7 天答错 · 不计分`, progress: progressFor('weak') },
    { key: 'free', label: '自由练习', count: null, hint: '自选范围 · 不计分', progress: progressFor('free') },
  ]

  const handleStart = async () => {
    const { queue: q } = await getQueue(strategy, params)
    if (q.length === 0) return
    startSession(q)
  }

  const handleFreeStart = async (scope: { kind: 'category' | 'random' | 'today' | 'weak'; categoryId?: string; limit: number }) => {
    const { queue: q } = await getQueue('free', params, scope)
    if (q.length === 0) return
    startSession(q)
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <StrategyList strategies={strategies} active={strategy} onSelect={(s: ReviewStrategy) => { reset(); setStrategy(s) }} />
      <main className="flex-1 overflow-auto">
        {phase === 'overview' && strategy === 'free' && (
          <FreeScopePanel
            categories={categories.map(c => ({ id: c.id, name: c.name }))}
            onStart={handleFreeStart}
          />
        )}
        {phase === 'overview' && strategy !== 'free' && (
          <OverviewPanel
            total={overview?.total ?? 0}
            newCount={overview?.newCount ?? 0}
            estimateMinutes={overview?.estimateMinutes ?? 0}
            masteryBuckets={overview?.masteryBuckets ?? [0, 0, 0, 0, 0]}
            onStart={handleStart}
            empty={(overview?.total ?? 0) === 0}
          />
        )}
        {live && <ReviewArena />}
        {phase === 'summary' && <SummaryPanel onRestart={() => { reset(); setStrategy('free') }} />}
      </main>
    </div>
  )
}
