import StatsMini from './StatsMini'
import SquareButton from '../ui/SquareButton'
import type { ReviewStats } from './StatsMini'

export default function OverviewPanel({ title, stats, onStart, startLabel = '开始复习', canStart }: {
  title: string
  stats: ReviewStats
  onStart: () => void
  startLabel?: string
  /** 本轮有没有题可出。与「开始复习」按钮的可用性**同一个判据**——
   *  从前是 total/empty 两个 prop 同源于一个数，改叫 canStart 是为了让这件事写在签名上。 */
  canStart: boolean
}) {
  if (!canStart) {
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
          disabled={!canStart} 在当前结构下走不到（为假时上面已提前 return），留它是防
          「概览与点击之间状态变了」那类改动的兜底——真到不了的按钮好过能按却没反应的按钮。 */}
      <SquareButton tone="surface" onClick={onStart} disabled={!canStart}>{startLabel}</SquareButton>
    </div>
  )
}
