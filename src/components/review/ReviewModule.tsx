import { useEffect, useRef, useState } from 'react'
import StrategyList, { type StrategyMeta } from './StrategyList'
import OverviewPanel from './OverviewPanel'
import FreeScopePanel from './FreeScopePanel'
import ReviewArena from './ReviewArena'
import SessionGuard from './SessionGuard'
import SummaryPanel from './SummaryPanel'
import ReviewConsole from './ReviewConsole'
import { useReviewSessionStore } from '../../stores/reviewSessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useCategoryStore } from '../../stores/categoryStore'
import { getStrategyCounts, getOverview, getQueue, REVIEW_DEFAULTS, type ReviewParams } from '../../services/reviewService'
import type { ReviewStrategy } from '../../lib/review/types'
import { isSessionLive } from '../../lib/review/sessionGuard'
import { scopeLabel, correctCount, TEMPLATE_LABEL } from '../../lib/review/scopeLabel'

export default function ReviewModule() {
  const { strategy, sessionStrategy, phase, queue, answered, freeScope, index, setStrategy, startSession, reset } = useReviewSessionStore()
  const reviewSettings = useSettingsStore(s => s.review)
  const categories = useCategoryStore(s => s.categories)
  const params: ReviewParams = { ...REVIEW_DEFAULTS, ...reviewSettings }

  const [counts, setCounts] = useState({ today: 0, weak: 0 })
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof getOverview>> | null>(null)
  // 组卷为空时的就地提示：先前是静默 return，用户按了按钮却什么都没发生
  const [emptyNotice, setEmptyNotice] = useState<string | null>(null)
  // 跨 effect 轮次共享的单调请求号：只有最后一次请求的结果允许落地
  const reqIdRef = useRef(0)

  // 会话进行中：有会话（phase 非概览/小结）且正在看它所属的策略。
  // 判据来自 sessionGuard.isSessionLive——与 SessionGuard 共用一处，两处分写会让
  // 差集区间内的点击静默无人拦。切到别的策略只看那个策略的概览；被切走的会话仍留在
  // store 里，但 v0.6.2 起 SessionGuard 会拦下这次点击并询问——不再原地保留、切回即续（§2.4 已废）。
  const sessionLive = isSessionLive(phase, sessionStrategy)
  const live = sessionLive && strategy === sessionStrategy
  // 小结属于会话自己那一栏：它可见时压过概览面板（否则自由练习的小结会与范围面板同时出现）
  const summaryVisible = phase === 'summary' && sessionStrategy === strategy
  // 概览态 = 没有正在展示的会话、也不在看小结：看别的策略时，它自己的概览照常出现。
  // v0.6.2 起会话进行中点别的策略会被 SessionGuard 拦下并询问——不再有「切走即续」。
  const showOverview = !live && !summaryVisible
  // 控制台的进度挂在「会话所属策略」上：看着别的策略时，原会话的进度仍在控制台里显示。
  // 但 v0.6.2 起 SessionGuard 会拦住这种切换，故实际只剩「会话自己那一栏」这一种情形。
  // 计数用的是**已答数**而不是 index——箭头翻看旧题不该改这里（条目 14）。
  const consoleSession = sessionLive && sessionStrategy && queue.length > 0
    ? {
        total: queue.length,
        answeredCount: answered.length,
        correctCount: correctCount(answered),
        scopeLabel: scopeLabel(sessionStrategy, freeScope?.kind ?? null),
        // 当前卡的题型。上面的 length > 0 已挡住空队列，index 越界时给「—」兜底
        templateLabel: queue[index] ? TEMPLATE_LABEL[queue[index].template] : '—',
      }
    : null

  // alive 防卸载后写 state；reqId 保证只有最新一次请求的结果生效（慢的旧请求不得覆盖新数据）。
  // 失败时把 overview 落到确定的空值，概览区显示空库引导而非一直空转。
  useEffect(() => {
    let alive = true
    const id = ++reqIdRef.current
    setEmptyNotice(null)
    const run = async () => {
      try {
        const [c, o] = await Promise.all([getStrategyCounts(params), getOverview(params)])
        if (!alive || id !== reqIdRef.current) return
        setCounts(c)
        setOverview(o)
      } catch {
        if (!alive || id !== reqIdRef.current) return
        setCounts({ today: 0, weak: 0 })
        setOverview({ total: 0, newCount: 0, estimateMinutes: 0, stats: { masteryBuckets: [0, 0, 0, 0, 0], dueByDay: [], recentRatings: [] } })
      }
    }
    run()
    return () => { alive = false }
  }, [params.retention, params.leechThreshold, params.newCardQuota, params.queueLimit, showOverview])

  const strategies: StrategyMeta[] = [
    // 策略条上不挂数字（v0.6.1 §2.5）；v0.6.2 起控制台报的是**已答数**，
    // 与光标位置无关，所以行上的 i/N 更没有存在理由（条目 13）。
    { key: 'today', label: '今日复习' },
    { key: 'free', label: '自由练习' },
  ]

  const NO_CARDS = '本轮没有可出的题。可能词条缺少出题所需的内容（释义 / 例句 / 音标），先到工作台补全。'

  const handleStart = async () => {
    setEmptyNotice(null)
    const { queue: q } = await getQueue(strategy, params)
    if (q.length === 0) { setEmptyNotice(NO_CARDS); return }
    // 今日复习没有范围：显式传 null，别让上一轮自由练习的 freeScope 靠 reset 才清掉
    startSession(q, null)
  }

  const handleFreeStart = async (scope: { kind: 'category' | 'random' | 'today' | 'weak'; categoryIds?: string[]; limit: number }) => {
    setEmptyNotice(null)
    const { queue: q } = await getQueue('free', params, scope)
    if (q.length === 0) { setEmptyNotice(NO_CARDS); return }
    // 控制台的「范围」读的是 store 里的 freeScope（spec §4.1 的四个自由练习名）。
    // 不传范围它恒为 null，只会显示通用的「自由练习」——四种范围分不出来。
    // 范围交给 startSession 一起写：队列非空才开本轮，没有会话就没有「本次」可言。
    startSession(q, scope)
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <StrategyList
        strategies={strategies}
        active={strategy}
        onSelect={(s: ReviewStrategy) => setStrategy(s)}
        header={<ReviewConsole overview={overview} weakCount={counts.weak} session={consoleSession} />}
      />
      {/* 右栏用 surface（白）铺底，左栏留在 canvas 上——与设置页、工作台同一套「nav 米色 / 内容白」分栏 */}
      <main className="flex-1 overflow-auto" style={{ background: 'var(--color-surface)' }}>
        <SessionGuard />
        {emptyNotice && (
          <span style={{ display: 'block', padding: '12px 32px 0', fontSize: '12px', color: '#c0705a' }}>{emptyNotice}</span>
        )}
        {showOverview && strategy === 'free' && (
          <FreeScopePanel
            categories={categories.map(c => ({ id: c.id, name: c.name, color: c.color }))}
            onStart={handleFreeStart}
          />
        )}
        {showOverview && strategy === 'today' && (
          <OverviewPanel
            title="今日复习"
            total={overview?.total ?? 0}
            stats={overview?.stats ?? { masteryBuckets: [], dueByDay: [], recentRatings: [] }}
            onStart={handleStart}
            startLabel="开始复习"
            empty={(overview?.total ?? 0) === 0}
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
