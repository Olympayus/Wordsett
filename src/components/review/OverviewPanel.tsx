import StatsMini from './StatsMini'
import SquareButton from '../ui/SquareButton'
import type { ReviewStats } from './StatsMini'

export default function OverviewPanel({ title, total, stats, onStart, startLabel = '开始复习', empty }: {
  title: string
  total: number
  stats: ReviewStats
  onStart: () => void
  startLabel?: string
  empty?: boolean
}) {
  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: 'var(--color-text-secondary)' }}>
        <p style={{ fontSize: '14px' }}>暂无可复习的内容</p>
        <p style={{ fontSize: '12px' }}>先到工作台积累词条，词条自带释义后即可开始复习</p>
      </div>
    )
  }
  return (
    <div className="flex flex-col items-start gap-5 p-8">
      <h2 style={{ fontSize: '20px', fontWeight: 600, fontFamily: 'var(--font-serif)' }}>{title}</h2>
      <StatsMini stats={stats} />
      {/* tone='surface'：本行所在的 flex-col 容器不设底，最近一个设了底的祖先是
          ReviewModule 的 <main>（--color-surface 纯白）。容器是 items-start，按钮不会被拉伸。
          disabled={total === 0} 保留但当前走不到：上面 empty 为真时已提前返回，而 empty 与
          total 同源于 overview?.total ?? 0。留它是给将来「概览不空、但没有可出的卡」那种
          独立判据留的位置——那时把它删了会重新引入一次「按钮能按、点了没反应」。 */}
      <SquareButton tone="surface" onClick={onStart} disabled={total === 0}>{startLabel}</SquareButton>
    </div>
  )
}
