import MasteryBar from './MasteryBar'

export default function OverviewPanel({ title, total, newCount, estimateMinutes, masteryBuckets, onStart, startLabel = '开始复习', empty }: {
  title: string
  total: number
  newCount: number
  estimateMinutes: number
  masteryBuckets: number[]
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
      <h2 style={{ fontSize: '20px', fontWeight: 600 }}>{title}</h2>
      <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
        {total} 张 · 含新词 {newCount} · 预计 {estimateMinutes} 分钟
      </p>
      <MasteryBar buckets={masteryBuckets} />
      <button
        type="button"
        onClick={onStart}
        disabled={total === 0}
        style={{
          padding: '8px 20px', borderRadius: 'var(--radius-lg)', border: 'none',
          background: total === 0 ? 'var(--color-border)' : 'var(--color-brand)', color: '#fff',
          cursor: total === 0 ? 'default' : 'pointer', fontSize: '13px',
        }}
      >
        {startLabel}
      </button>
    </div>
  )
}
