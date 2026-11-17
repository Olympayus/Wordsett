import { dayTotal, dayAccuracy, lastSevenDays } from '../../lib/review/trend'
import { MASTERY_COLORS, MASTERY_TIER_NAMES } from '../../lib/review/masteryScale'
import type { ReviewStats } from './StatsMini'

/**
 * `getOverview` 里自由练习读数块用到的那三个数（v0.7.10 §7.7）。
 *
 * 只取需要的键而不是整个 overview：本组件不碰 `deliverable` / `newCount` / `stats`，
 * 收窄类型能让调用点漏传时在编译期先叫。`ReviewModule` 直接把 `overview` 传进来，
 * 结构兼容、无需重建对象。
 */
export interface FreeOverview {
  /** 今日到期卡数（`getOverview().total`，单位是**卡**） */
  total: number
  /** 今日到期摊平后的词数（`dueWordCount`） */
  dueWordCount: number
  /** 当日自由练习作答条数（`practiceToday`，spec §7.7 新增） */
  practiceToday: number
}

/**
 * 自由练习「全库随机 / 今日队列重练」两页的读数块（v0.7.10 §7.7）。
 *
 * **只负责画，数据全部由 props 进**：工作区词数来自 `useWordStore().counts.workspace`
 * （由 `FreeScopePanel` 取），`stats` / `overview` 来自 `ReviewModule` 的 `getOverview`。
 * 本组件不发查询、不读 store，是内容区里的一块静态读数。
 *
 * **两档几何**（v0.7.10 §7.7）：缺省 `desktop`——瓦片 padding 10 / 12、数值 20px、
 * 熟悉度条高 10；`mobile`——瓦片三列 gap 8、数值 17px、熟悉度条高 8。手机档由
 * `FreeScopePanel` 的 mobile 分支传入，桌面几何逐字不变。
 *
 * **口径（规格 §7.7）**：近 7 天题数与记得率取自 `stats.recentRatings`（原窗口 14 天，
 * 这里过滤到最近 7 个本地日历日），这份数据来自 `review_logs.rating`，**只反映计分复习**
 * （与 `StatsMini` 的「复习量 / 记得率」同源）；
 * 自由练习本身**不计分、不写 rating**，它的量由「今日已练」（`practiceToday`）单独表达。
 * 两处不是同一个分母，别把它们相加或互相折算。
 */
export default function FreeScopeStats({ kind, workspaceCount, stats, overview, variant = 'desktop' }: {
  /**
   * `random` / `today` 各有一套读数；`category` / `weak` 复用 `random` 那三枚瓦片
   * 与熟悉度条（v0.7.10 §7.7：手机在这两页下方补同形的紧凑块，桌面不渲染）。
   */
  kind: 'random' | 'today' | 'category' | 'weak'
  /** 工作区词数（复习只认工作区，储藏库词不参与） */
  workspaceCount: number
  stats: ReviewStats
  overview: FreeOverview | null
  /** 几何档（v0.7.10 T23）：缺省 `desktop`；手机外壳传 `mobile`，桌面调用点不传。 */
  variant?: 'desktop' | 'mobile'
}) {
  return kind === 'today'
    ? <TodayStats stats={stats} overview={overview} variant={variant} />
    : <RandomStats workspaceCount={workspaceCount} stats={stats} variant={variant} />
}

const TILES: React.CSSProperties = { display: 'flex', gap: 10, width: '100%' }
const BLOCK_LABEL: React.CSSProperties = {
  marginTop: 18,
  marginBottom: 6,
  fontSize: 11,
  letterSpacing: '.3px',
  color: 'var(--color-text-secondary)',
}

/** 读数瓦片：桌面几何同预览（padding 10 / 12、数值 20px、标签 11px）；手机档数值 17px（v0.7.10 T23）。 */
function Tile({ value, label, mobile }: { value: number | string; label: string; mobile: boolean }) {
  return (
    <div style={{
      flex: 1, minWidth: 0,
      padding: '10px 12px',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--color-surface)',
    }}>
      <div className="stat-num" style={{ fontSize: mobile ? 17 : 20, lineHeight: 1.2 }}>{value}</div>
      <div style={{ marginTop: 2, fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </div>
    </div>
  )
}

/**
 * `random`：工作区词数 / 近 7 天题数 / 近 7 天记得率 + 熟悉度 6 档条。
 *
 * 记得率＝`trend.ts` 的 `dayAccuracy`（good / 总评分数，v0.7.2 起「记得率」= rating 3 占比），
 * 按当日题量加权汇总——与 `StatsMini` 的趋势卡副标题同一算法、同一口径。规格 §7.7 要求
 * 本块与 `StatsMini`「复习量 / 记得率」同源，故这里不另写一套公式。
 * 题数与记得率都**先过滤到最近 7 个本地日历日**（`lastSevenDays`，`recentRatings` 原窗口
 * 是 14 天），标签与数据窗口一致。0 条时显示「—」而不是 0%——0/0 是未定义，写成 0% 会被
 * 读成「全忘了」。
 */
function RandomStats({ workspaceCount, stats, variant }: { workspaceCount: number; stats: ReviewStats; variant: 'desktop' | 'mobile' }) {
  const mobile = variant === 'mobile'
  const recent = lastSevenDays(stats.recentRatings)
  const total = recent.reduce((n, r) => n + dayTotal(r), 0)
  // 按当日题量加权，不能对每日记得率取简单平均——那会让只有 1 张的日子与 20 张的日子等权。
  const accuracy = total > 0
    ? recent.reduce((n, r) => n + dayAccuracy(r) * dayTotal(r), 0) / total
    : null
  const rateText = accuracy === null ? '—' : `${Math.round(accuracy * 100)}%`
  const masteryTotal = stats.masteryBuckets.reduce((a, b) => a + b, 0)
  // 桶总和为 0 时归一化基准取 1，避免 0/0；此时所有段宽为 0，底轨仍画出空条。
  const denom = Math.max(1, masteryTotal)
  return (
    <div style={{ width: '100%' }}>
      <div style={mobile ? { ...TILES, gap: 8 } : TILES}>
        <Tile value={workspaceCount} label="工作区词数" mobile={mobile} />
        <Tile value={total} label="近 7 天练习题数" mobile={mobile} />
        <Tile value={rateText} label="近 7 天记得率" mobile={mobile} />
      </div>

      <div style={BLOCK_LABEL}>熟悉度分布</div>
      {/* 色阶与标签全部来自 masteryScale（与 StatsMini 的 MasteryBuckets 同一处）：
          本文件不写任何色值，避免同一个概念在两处各有一套分档。底轨先铺 --color-border，
          桶全空时这条仍是可见的空条，而不是一条消失的线。 */}
      <div style={{ display: 'flex', height: mobile ? 8 : 10, borderRadius: mobile ? 4 : 5, overflow: 'hidden', background: 'var(--color-border)' }}>
        {MASTERY_TIER_NAMES.map((_, i) => {
          const n = stats.masteryBuckets[i] ?? 0
          return <div key={i} style={{ width: `${(n / denom) * 100}%`, background: MASTERY_COLORS[i] }} />
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginTop: 5 }}>
        {MASTERY_TIER_NAMES.map((name, i) => (
          <span key={name} style={{ fontSize: 10, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {name} {stats.masteryBuckets[i] ?? 0}
          </span>
        ))}
      </div>
    </div>
  )
}

/** 柱状图的日期标签：第 0 根是今天，第 1 根是明天，其余「+N 天」。 */
function dueDayLabel(i: number): string {
  if (i === 0) return '今天'
  if (i === 1) return '明天'
  return `+${i} 天`
}

/**
 * `today`：今日到期（卡）/ 涉及词数 / 今日已练 + 未来 8 根到期柱。
 *
 * `dueByDay` 的既有形状是 8 项（今天 + 未来 7 天，见 `db/review.ts` 的 getStats）；
 * 这里按 8 根固定渲染，缺项补 0——空数组（概览读失败时的兜底）也不会画成一根柱。
 * 「今日已练」增长而「今日到期」不动是重练的本义：练习不推进 `due_at`，读数不为它造「剩余」。
 */
function TodayStats({ stats, overview, variant }: { stats: ReviewStats; overview: FreeOverview | null; variant: 'desktop' | 'mobile' }) {
  const mobile = variant === 'mobile'
  const days = Array.from({ length: 8 }, (_, i) => stats.dueByDay[i] ?? 0)
  const max = Math.max(1, ...days)
  return (
    <div style={{ width: '100%' }}>
      <div style={mobile ? { ...TILES, gap: 8 } : TILES}>
        <Tile value={overview?.total ?? 0} label="今日到期" mobile={mobile} />
        <Tile value={overview?.dueWordCount ?? 0} label="涉及词数" mobile={mobile} />
        <Tile value={overview?.practiceToday ?? 0} label="今日已练" mobile={mobile} />
      </div>

      <div style={BLOCK_LABEL}>今日与未来 7 天到期分布</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, width: '100%', paddingTop: 2 }}>
        {days.map((n, i) => (
          <div key={i} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 10.5, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
            {/* 柱高按当日最大值归一；峰值柱用满不透明品牌色，其余退到 35%——与预览同形，
                也复用了 StatsMini 柱图「只靠品牌色 + 透明度」的既有做法。 */}
            <div style={{
              width: 22,
              height: n === 0 ? 2 : Math.max(3, (n / max) * 46),
              borderRadius: '4px 4px 2px 2px',
              background: 'var(--color-brand)',
              opacity: n > 0 && n === max ? 1 : 0.35,
            }} />
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{dueDayLabel(i)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
