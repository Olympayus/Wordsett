import StatsMini from './StatsMini'
import SquareButton from '../ui/SquareButton'
import type { ReviewStats } from './StatsMini'

export default function OverviewPanel({ title, total, newCount, estimateMinutes, stats, onStart, startLabel = '开始复习', empty }: {
  title: string
  total: number
  newCount: number
  estimateMinutes: number
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
      <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
        {total} 张 · 含新词 {newCount} · 预计 {estimateMinutes} 分钟
      </p>
      <StatsMini stats={stats} />
      {/* tone='surface'：本行所在的 flex-col 容器不设底，最近一个设了底的祖先是
          ReviewModule 的 <main>（--color-surface 纯白）。容器是 items-start，按钮不会被拉伸。 */}
      <SquareButton tone="surface" onClick={onStart} disabled={total === 0}>{startLabel}</SquareButton>
    </div>
  )
}
