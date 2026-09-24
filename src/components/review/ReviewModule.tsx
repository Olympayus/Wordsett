import { useEffect, useRef, useState } from 'react'
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
  const { strategy, sessionStrategy, phase, queue, index, setStrategy, startSession, reset } = useReviewSessionStore()
  const reviewSettings = useSettingsStore(s => s.review)
  const categories = useCategoryStore(s => s.categories)
  const params: ReviewParams = { ...REVIEW_DEFAULTS, ...reviewSettings }

  const [counts, setCounts] = useState({ today: 0, weak: 0 })
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof getOverview>> | null>(null)
  // 跨 effect 轮次共享的单调请求号：只有最后一次请求的结果允许落地
  const reqIdRef = useRef(0)

  // 会话进行中：有会话（phase 非概览/小结）且正在看它所属的策略。
  // 切到别的策略只看那个策略的概览，被切走的会话原地保留在 store 里，切回即续（规格 §2.4）。
  const sessionLive = phase !== 'overview' && phase !== 'summary' && sessionStrategy !== null
  const live = sessionLive && strategy === sessionStrategy
  // 小结属于会话自己那一栏：它可见时压过概览面板（否则自由练习的小结会与范围面板同时出现）
  const summaryVisible = phase === 'summary' && sessionStrategy === strategy
  // 概览态 = 没有正在展示的会话、也不在看小结：看别的策略时，它自己的概览照常出现（规格 §2.4）
  const showOverview = !live && !summaryVisible
  // 进度挂在「会话所属策略」上：看着别的策略时，原会话仍显示题号与题型
  const progressFor = (key: ReviewStrategy) =>
    sessionLive && key === sessionStrategy && queue.length > 0
      ? { index, total: queue.length, template: queue[index]?.template ?? '' }
      : null

  // alive 防卸载后写 state；reqId 保证只有最新一次请求的结果生效（慢的旧请求不得覆盖新数据）。
  // 失败时把 overview 落到确定的空值，概览区显示空库引导而非一直空转。
  useEffect(() => {
    let alive = true
    const id = ++reqIdRef.current
    const run = async () => {
      try {
        const [c, o] = await Promise.all([getStrategyCounts(params), getOverview(params)])
        if (!alive || id !== reqIdRef.current) return
        setCounts(c)
        setOverview(o)
      } catch {
        if (!alive || id !== reqIdRef.current) return
        setCounts({ today: 0, weak: 0 })
        setOverview({ total: 0, newCount: 0, estimateMinutes: 0, masteryBuckets: [0, 0, 0, 0, 0] })
      }
    }
    run()
    return () => { alive = false }
  }, [params.retention, params.leechThreshold, params.newCardQuota, params.queueLimit, showOverview])

  const strategies: StrategyMeta[] = [
    { key: 'today', label: '今日复习', count: counts.today, hint: '到期 + 新词额度 · 计分', progress: progressFor('today') },
    { key: 'weak', label: '薄弱词专项', count: counts.weak, hint: `连错 ≥ ${params.leechThreshold} ∪ 近 7 天答错 · 不计分`, progress: progressFor('weak') },
    { key: 'free', label: '自由练习', count: null, hint: '自选范围 · 不计分', progress: progressFor('free') },
  ]

  // 薄弱词专项不引进新词、不走今日队列：数字取 getStrategyCounts 的 weak（getOverview 只描述今日队列）
  const weakTotal = counts.weak
  const weakEstimate = Math.max(1, Math.round(weakTotal * 0.3))
  const overviewTitle = strategy === 'weak' ? '薄弱词专项' : '今日复习'
  const startLabel = strategy === 'weak' ? '开始专项练习' : '开始复习'

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
      <StrategyList strategies={strategies} active={strategy} onSelect={(s: ReviewStrategy) => setStrategy(s)} />
      <main className="flex-1 overflow-auto">
        {showOverview && strategy === 'free' && (
          <FreeScopePanel
            categories={categories.map(c => ({ id: c.id, name: c.name }))}
            onStart={handleFreeStart}
          />
        )}
        {showOverview && strategy !== 'free' && (
          <OverviewPanel
            title={overviewTitle}
            total={strategy === 'weak' ? weakTotal : (overview?.total ?? 0)}
            newCount={strategy === 'weak' ? 0 : (overview?.newCount ?? 0)}
            estimateMinutes={strategy === 'weak' ? weakEstimate : (overview?.estimateMinutes ?? 0)}
            masteryBuckets={overview?.masteryBuckets ?? [0, 0, 0, 0, 0]}
            onStart={handleStart}
            startLabel={startLabel}
            empty={(strategy === 'weak' ? weakTotal : (overview?.total ?? 0)) === 0}
          />
        )}
        {live && <ReviewArena />}
        {summaryVisible && (
          <SummaryPanel onRestart={() => { reset(); setStrategy('free') }} />
        )}
      </main>
    </div>
  )
}
