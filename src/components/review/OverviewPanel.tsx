import StatsMini from './StatsMini'
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
      <TrendBar ratings={stats.recentRatings} />
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

/** 近 14 天趋势（spec §3.6）：柱高＝当日复习量，柱色深浅＝当日正确率。样本不足显示占位。 */
function TrendBar({ ratings }: { ratings: ReviewStats['recentRatings'] }) {
  if (ratings.length < 3) {
    return (
      <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '10px 12px' }}>
        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>近 14 天 · 复习量 / 正确率</div>
        <div style={{ fontSize: '12px', marginTop: 6, color: 'var(--color-text-secondary)' }}>数据积累中</div>
      </div>
    )
  }
  const total = (r: ReviewStats['recentRatings'][number]) => r.again + r.hard + r.good
  const max = Math.max(1, ...ratings.map(total))
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '10px 12px' }}>
      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: 8 }}>近 14 天 · 复习量 / 正确率</div>
      <div className="flex items-end gap-[3px]" style={{ height: 40 }}>
        {ratings.map(r => {
          const n = total(r)
          const acc = n > 0 ? r.good / n : 0
          return (
            <div
              key={r.day}
              title={`${r.day}：${n} 张，正确率 ${Math.round(acc * 100)}%`}
              style={{
                flex: 1, height: `${Math.max(2, (n / max) * 40)}px`,
                background: 'var(--color-brand)', opacity: 0.35 + acc * 0.65, borderRadius: '2px 2px 0 0',
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
