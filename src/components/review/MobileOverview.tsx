import ReviewConsole from './ReviewConsole'
import StatsMini, { type ReviewStats } from './StatsMini'
import SquareButton from '../ui/SquareButton'

/**
 * 手机复习概览（今日复习，v0.7.6 §4）。
 *
 * 三段与控制台的取数**同源**：控制台、主操作、统计图读的都是 `ReviewModule` 已经取好的
 * `overview` / `counts`，本组件不自己发请求、也不另算一个数——桌面 OverviewPanel 也只做
 * 「摆出来」这一件事。
 *
 * 与桌面概览的两处差别是布局而非内容：
 * 1. 控制台从左侧栏搬进内容区顶部（手机上根本没有左侧栏）；
 * 2. 「开始复习」外包一层 flex 由 `grow` 撑满整行（桌面是行内按钮）。
 *
 * 空库不在这里提前 return（桌面 OverviewPanel 会）：手机版把「本轮可出 0 道」留在控制台
 * 里、按钮置灰，比整页换成一段空态更接近规格所画的三段结构（§4）。
 */
export default function MobileOverview({ overview, weakCount, stats, canStart, onStart }: {
  /** 与 ReviewConsole 的入参同一个形状——控制台怎么读，标题行与这里就怎么读。 */
  overview: { total: number; newCount: number; deliverable: number; dueWordCount: number } | null
  weakCount: number
  stats: ReviewStats
  /** 本轮有没有题可出，与桌面概览同一条判据（overview.deliverable > 0）。 */
  canStart: boolean
  onStart: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '14px 16px 20px' }}>
      <ReviewConsole overview={overview} weakCount={weakCount} session={null} />
      {/* 外层 flex 只为让 SquareButton 的 grow 有处可撑：grow 是 flex 分配，块级父级里无处生效。 */}
      <div style={{ display: 'flex' }}>
        <SquareButton tone="surface" grow onClick={onStart} disabled={!canStart}>开始复习</SquareButton>
      </div>
      <StatsMini stats={stats} variant="mobile" />
    </div>
  )
}
