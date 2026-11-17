import { useEffect, useRef, useState } from 'react'
import StrategyList, { type StrategyMeta } from './StrategyList'
import StrategyTabs from './StrategyTabs'
import OverviewPanel from './OverviewPanel'
import MobileOverview from './MobileOverview'
import FreeScopePanel from './FreeScopePanel'
import ReviewArena from './ReviewArena'
import ArenaNavBar from './ArenaNavBar'
import SessionGuard from './SessionGuard'
import SummaryPanel from './SummaryPanel'
import ReviewConsole from './ReviewConsole'
import type { ReviewStats } from './StatsMini'
import SquareButton from '../ui/SquareButton'
import { useReviewSessionStore } from '../../stores/reviewSessionStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useCategoryStore } from '../../stores/categoryStore'
import { useUiStore } from '../../stores/uiStore'
import { useWordStore } from '../../stores/wordStore'
import { usePlatformClass } from '../../lib/usePlatform'
import { usesMobileShell } from '../../lib/platform'
import { getStrategyCounts, getOverview, getQueue, REVIEW_DEFAULTS, type ReviewParams } from '../../services/reviewService'
import type { ReviewStrategy } from '../../lib/review/types'
import { startButtonState, type FreeScopeSelection } from '../../lib/review/startButton'
import { canStartFreeScope } from '../../lib/review/categoryCounts'
import { isSessionLive } from '../../lib/review/sessionGuard'
import { canGoBack, canGoForward, answeredCount } from '../../lib/review/nav'
import { scopeLabel, correctCount, TEMPLATE_LABEL } from '../../lib/review/scopeLabel'

/**
 * 概览尚未读到 / 读失败时传给统计组件的空值（v0.7.10 Task 22）。
 * `masteryBuckets` 给空数组即可：消费方按桶总和归一，全空时条为零宽、由底轨兜住。
 * 三处统计消费点（自由练习读数块、桌面 / 手机概览）共用这一份，免得同一个空值抄三遍。
 */
const EMPTY_STATS: ReviewStats = { masteryBuckets: [], dueByDay: [], recentRatings: [] }

export default function ReviewModule() {
  const { strategy, sessionStrategy, phase, queue, answered, freeScope, index, setStrategy, startSession, setIndex, reset } = useReviewSessionStore()
  // 手机判定走与外壳同一条纯函数（v0.7.6 §4）：手机外壳里本模块只在 android-phone 下挂载，
  // 但判据仍由 usesMobileShell 给出——另写媒体查询就会与外壳各说各话。
  const platform = usePlatformClass()
  const mobile = usesMobileShell(platform)
  const reviewSettings = useSettingsStore(s => s.review)
  const categories = useCategoryStore(s => s.categories)
  const params: ReviewParams = { ...REVIEW_DEFAULTS, ...reviewSettings }
  // 工作区词数（v0.7.10 §7.7）：左栏「词库为空」判据与 FreeScopePanel 的读数取同一个
  // store 字段——复习只认工作区（储藏库词不参与），它随 loadWords 顺带刷新，不新增 db 查询。
  const wordCount = useWordStore(s => s.counts.workspace)

  const [counts, setCounts] = useState({ today: 0, weak: 0 })
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof getOverview>> | null>(null)
  // 自由练习的范围选择（v0.7.10 §7.7）：从 FreeScopePanel 提升上来，桌面左栏开始按钮与
  // 右栏范围面板（以及手机分支）共用同一份编辑态。它刻意不叫 store 里的 freeScope——那个
  // 只描述「已开始会话」的范围，语义不变。
  const [freeSelection, setFreeSelection] = useState<FreeScopeSelection>({ kind: 'random', categoryIds: [], limit: 20 })
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
  // 左栏开始按钮的呈现态（v0.7.10 §7.7）：判据全部收在 `startButtonState` 纯函数里
  // （隐藏 / 文案 / 置灰 / 原因），这里只喂数的来源——今日复习看本轮可出题数，
  // 自由练习看工作区词数 + 当前范围选择，`live` 时整块隐藏。
  const startState = startButtonState({
    strategy,
    live,
    deliverable: overview?.deliverable ?? 0,
    wordCount,
    free: freeSelection,
  })
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
        setOverview({ total: 0, newCount: 0, deliverable: 0, dueWordCount: 0, practiceToday: 0, stats: { masteryBuckets: [0, 0, 0, 0, 0, 0], dueByDay: [], recentRatings: [] } })
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

  const handleFreeStart = async (selection: FreeScopeSelection) => {
    setEmptyNotice(null)
    // 今日队列无数量，全量出题：buildQueue 仅用它做上限截断，MAX_SAFE_INTEGER 即「不截断」。
    // （面板的数量框只对 random / category / weak 有意义；今日复习页不渲染它，见 T22。）
    const scope = {
      kind: selection.kind,
      categoryIds: selection.kind === 'category' ? selection.categoryIds : undefined,
      limit: selection.kind === 'today' ? Number.MAX_SAFE_INTEGER : selection.limit,
    }
    const { queue: q } = await getQueue('free', params, scope)
    if (q.length === 0) { setEmptyNotice(NO_CARDS); return }
    // 控制台的「范围」读的是 store 里的 freeScope（spec §4.1 的四个自由练习名）。
    // 不传范围它恒为 null，只会显示通用的「自由练习」——四种范围分不出来。
    // 范围交给 startSession 一起写：队列非空才开本轮，没有会话就没有「本次」可言。
    startSession(q, scope)
  }

  // 结束本轮（Ruling 26b）：随导航条一起从 ReviewArena 上移到这里——导航条吸顶时它的
  // 宿主也得在这一层。所需的东西（useUiStore、queue、answered、reset）这里都有，
  // 故 ReviewArena 里不再留副本。
  const handleEnd = async () => {
    const ok = await useUiStore.getState().confirm({
      title: '结束本轮回合？',
      message: `已答的 ${answeredCount(answered)} 道题照常保存，但本轮不会生成结算，剩余 ${Math.max(0, queue.length - answeredCount(answered))} 题留到下次。`,
      confirmLabel: '结束并退出',
      danger: true,
    })
    if (ok) reset()
  }

  // 桌面开始按钮（v0.7.10 §6.5 / §7.7）：统一到左栏控制台下方、策略项之上。
  // 节点在模块层组装——开一轮要读库并写会话 store，StrategyList 只接收 `start` 插槽摆位置。
  // `visible === false`（会话进行中）时整块不渲染：同屏不再有第二个入口。
  // 几何：220px 窄栏里按钮全宽，原因行 10.5px 三级墨、只在该说的时候出现；外层固定最小
  // 高度预留一行原因（8 + 31 + 4 + 16 + 8 ≈ 67），置灰原因出现 / 消失时下方策略项不跳动。
  const desktopStart = startState.visible ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', padding: '8px 12px', minHeight: 68 }}>
      {/* 按钮的 grow 要 flex 父级才能撑满（与 FreeScopePanel 手机分支同一做法）。
          tone 用缺省的 canvas：左栏 nav 无底色，最近的有色祖先是 AppShell 的 `--color-canvas`
          （SquareButton 的 tone 契约按**直接父级**判，surface 只给纯白底），
          surface 的浅色 hover 压在 canvas 上几乎不可见（评审 fix round 1）。 */}
      <div style={{ display: 'flex', width: '100%' }}>
        <SquareButton
          tone="canvas"
          grow
          disabled={startState.disabled}
          onClick={() => void (strategy === 'free' ? handleFreeStart(freeSelection) : handleStart())}
        >
          {startState.label}
        </SquareButton>
      </div>
      {startState.reason !== null && (
        <span style={{ fontSize: '10.5px', lineHeight: 1.5, color: 'var(--color-text-tertiary)' }}>{startState.reason}</span>
      )}
    </div>
  ) : undefined

  // 手机端「开始练习」仍紧贴范围卡下方（v0.7.10 §7.7，布局不变）。按钮节点在模块层组装：
  // 开一轮要读库并写 store，FreeScopePanel 只接收 `start` 插槽、不复制这套逻辑。
  const mobileFreeStart = (
    <SquareButton
      tone="surface"
      grow
      disabled={!canStartFreeScope(freeSelection.kind, freeSelection.categoryIds)}
      onClick={() => void handleFreeStart(freeSelection)}
    >
      开始练习
    </SquareButton>
  )

  // 手机分支（v0.7.6 §4）：不渲染 220px 左侧策略栏，改为标题行 + 分段控件 + 概览内容。
  // 数据逻辑全部复用上面的推导（live / showOverview / summaryVisible …），这里只换布局——
  // 两套分支各推一份「是否在会话里」，迟早会漂。
  if (mobile) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden" style={{ background: 'var(--color-surface)' }}>
        {/* 守卫照旧挂载：手机上的策略分段控件同样带 data-session-guard，
            会话进行中点另一个策略要在这里被拦下并询问（与桌面同一处判据）。 */}
        <SessionGuard />
        {/* 顶区：标题行 + 策略分段控件。待复习数取 overview.total——与 ReviewConsole
            第一行同一个数（getOverview 把 getStrategyCounts 的 today 落进 total），
            不另算一份，免得同一屏上两处口径各改各的。 */}
        <div style={{ padding: '14px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22, fontWeight: 600 }}>复习</span>
            <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
              今天 <span className="stat-num">{overview?.total ?? 0}</span> 张待复习
            </span>
          </div>
          <div style={{ marginTop: 10 }}>
            <StrategyTabs strategies={strategies} active={strategy} onSelect={setStrategy} />
          </div>
        </div>

        {/* 内容区。live 时**不滚动**：ReviewArena 手机形态的底栏靠 height:100% 钉底，
            只有父级高度确定且不滚动，那条底栏才既不会掉到折叠线以下、也不会双滚动。
            其余三态各自包一层滚动容器（flex:1 + overflowY:auto）。 */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {emptyNotice && (
            <span style={{ display: 'block', flexShrink: 0, padding: '12px 16px 0', fontSize: '12px', color: 'var(--color-danger)' }}>{emptyNotice}</span>
          )}
          {live ? (
            <>
              {/* 导航块与桌面那一块逐项相同，但**不吸顶**：这一支整体不滚动，sticky 没有可吸的
                  滚动祖先。块本身通栏，进度条因此与导航条同宽。 */}
              <div style={{ flexShrink: 0, background: 'var(--color-surface)' }}>
                <ArenaNavBar
                  index={index}
                  total={queue.length}
                  canBack={canGoBack(index)}
                  canForward={canGoForward(queue, answered, index)}
                  onBack={() => setIndex(index - 1)}
                  onForward={() => setIndex(index + 1)}
                  onEnd={() => void handleEnd()}
                />
                <div style={{ height: '3px', background: 'var(--color-border)' }}>
                  <div style={{ width: `${((index + 1) / queue.length) * 100}%`, height: '100%', background: 'var(--color-brand)' }} />
                </div>
              </div>
              {/* 确定高度的宿主：minHeight:0 让这一格真的能缩到剩余空间，
                  否则 flex 子项的默认最小高度是内容高，答题底栏会被顶出屏幕。 */}
              <div style={{ flex: 1, minHeight: 0 }}>
                <ReviewArena mobile />
              </div>
            </>
          ) : (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {showOverview && strategy === 'free' && (
                <FreeScopePanel
                  variant="mobile"
                  categories={categories.map(c => ({ id: c.id, name: c.name, color: c.color }))}
                  value={freeSelection}
                  onChange={setFreeSelection}
                  start={mobileFreeStart}
                  overview={overview}
                  stats={overview?.stats ?? EMPTY_STATS}
                />
              )}
              {showOverview && strategy === 'today' && (
                <MobileOverview
                  overview={overview}
                  weakCount={counts.weak}
                  stats={overview?.stats ?? EMPTY_STATS}
                  canStart={(overview?.deliverable ?? 0) > 0}
                  onStart={handleStart}
                />
              )}
              {summaryVisible && (
                <SummaryPanel variant="mobile" onRestart={() => { reset(); setStrategy('free') }} />
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <StrategyList
        strategies={strategies}
        active={strategy}
        onSelect={(s: ReviewStrategy) => setStrategy(s)}
        header={<ReviewConsole overview={overview} weakCount={counts.weak} session={consoleSession} />}
        start={desktopStart}
      />
      {/* 右栏用 surface（白）铺底，左栏留在 canvas 上——与设置页、工作台同一套「nav 米色 / 内容白」分栏 */}
      <main className="flex-1 overflow-auto" style={{ background: 'var(--color-surface)' }}>
        <SessionGuard />
        {emptyNotice && (
          <span style={{ display: 'block', padding: '12px 32px 0', fontSize: '12px', color: 'var(--color-danger)' }}>{emptyNotice}</span>
        )}
        {showOverview && strategy === 'free' && (
          <FreeScopePanel
            categories={categories.map(c => ({ id: c.id, name: c.name, color: c.color }))}
            value={freeSelection}
            onChange={setFreeSelection}
            overview={overview}
            stats={overview?.stats ?? EMPTY_STATS}
          />
        )}
        {showOverview && strategy === 'today' && (
          <OverviewPanel
            title="今日复习"
            stats={overview?.stats ?? EMPTY_STATS}
          />
        )}
        {live && (
          // 导航条与进度条共处一个吸顶块（v0.7.2，Ruling 26）：ArenaNavBar 自带的 sticky 已去掉，
          // 这一层是唯一的吸顶层，块本身通栏（无左右内缩），进度条因此与导航条同宽。
          <div style={{ position: 'sticky', top: 0, zIndex: 'var(--z-sticky)', background: 'var(--color-surface)' }}>
            <ArenaNavBar
              index={index}
              total={queue.length}
              canBack={canGoBack(index)}
              canForward={canGoForward(queue, answered, index)}
              onBack={() => setIndex(index - 1)}
              onForward={() => setIndex(index + 1)}
              onEnd={() => void handleEnd()}
            />
            <div style={{ height: '3px', background: 'var(--color-border)' }}>
              <div style={{ width: `${((index + 1) / queue.length) * 100}%`, height: '100%', background: 'var(--color-brand)' }} />
            </div>
          </div>
        )}
        {live && <ReviewArena />}
        {summaryVisible && (
          <SummaryPanel onRestart={() => { reset(); setStrategy('free') }} />
        )}
      </main>
    </div>
  )
}
