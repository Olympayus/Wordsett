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
  const totalCards = masteryBuckets.reduce((a, b) => a + b, 0)
  return (
    <div className="flex flex-col items-start gap-5 p-8">
      <h2 style={{ fontSize: '20px', fontWeight: 600 }}>{title}</h2>
      <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
        {total} 张 · 含新词 {newCount} · 预计 {estimateMinutes} 分钟
      </p>
      <MasteryBar buckets={masteryBuckets} total={totalCards} />
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

function MasteryBar({ buckets, total }: { buckets: number[]; total: number }) {
  if (total === 0) return null
  const colors = ['var(--color-border)', '#c9d4e0', '#a9bccf', '#7f9bb8', '#5a7d9e']
  return (
    <div className="flex flex-col gap-1" style={{ width: '100%', maxWidth: '420px' }}>
      <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>掌握度分布</span>
      <div className="flex" style={{ height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
        {buckets.map((n, i) => (
          <div key={i} style={{ width: `${(n / total) * 100}%`, background: colors[i] }} />
        ))}
      </div>
    </div>
  )
}
