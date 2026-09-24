export interface ReviewStats {
  masteryBuckets: number[]
  dueByDay: number[]
  recentRatings: { day: string; again: number; hard: number; good: number }[]
}

export default function StatsMini({ stats }: { stats: ReviewStats }) {
  const sparse = stats.recentRatings.length < 3 && stats.dueByDay.every(n => n === 0)
  if (sparse) {
    return (
      <div className="flex gap-3">
        {['遗忘曲线变动', '明日压力', '熟知度分布'].map(t => (
          <div key={t} style={{ flex: 1, padding: '10px 12px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{t}</div>
            <div style={{ fontSize: '12px', marginTop: '6px', color: 'var(--color-text-secondary)' }}>数据积累中</div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="flex gap-3">
      <MiniCard title="遗忘曲线变动"><RatingSpark data={stats.recentRatings} /></MiniCard>
      <MiniCard title="明日压力"><DueBars data={stats.dueByDay} /></MiniCard>
      <MiniCard title="熟知度分布"><MasteryBuckets data={stats.masteryBuckets} /></MiniCard>
    </div>
  )
}

function MiniCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, padding: '10px 12px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>{title}</div>
      {children}
    </div>
  )
}

const W = 120, H = 28

function RatingSpark({ data }: { data: ReviewStats['recentRatings'] }) {
  const max = Math.max(1, ...data.map(d => d.again + d.hard + d.good))
  const step = data.length > 1 ? W / (data.length - 1) : W
  const pts = data.map((d, i) => {
    const v = (d.good + d.hard * 0.5) / max
    return `${i * step},${H - v * H}`
  }).join(' ')
  return (
    <svg width={W} height={H} role="img" aria-label="近期评分走势">
      <polyline points={pts} fill="none" stroke="var(--color-brand)" strokeWidth="1.5" />
    </svg>
  )
}

function DueBars({ data }: { data: number[] }) {
  const max = Math.max(1, ...data)
  return (
    <div className="flex items-end gap-[3px]" style={{ height: H }}>
      {data.map((n, i) => (
        <div key={i} title={`${i} 天后：${n} 张`} style={{ width: '10px', height: `${Math.max(2, (n / max) * H)}px`, background: 'var(--color-brand)', opacity: 0.75, borderRadius: '2px' }} />
      ))}
    </div>
  )
}

function MasteryBuckets({ data }: { data: number[] }) {
  const total = Math.max(1, data.reduce((a, b) => a + b, 0))
  const colors = ['var(--color-border)', '#c9d4e0', '#a9bccf', '#7f9bb8', '#5a7d9e']
  return (
    <div className="flex" style={{ height: '10px', borderRadius: '5px', overflow: 'hidden' }}>
      {data.map((n, i) => <div key={i} style={{ width: `${(n / total) * 100}%`, background: colors[i] }} />)}
    </div>
  )
}
