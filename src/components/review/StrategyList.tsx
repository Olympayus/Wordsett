import type { ReviewStrategy } from '../../lib/review/types'

export interface StrategyMeta {
  key: ReviewStrategy
  label: string
  count: number | null
  hint: string
  /** 该策略有进行中的会话时给出进度；就地展开在左栏条目下方 */
  progress?: { index: number; total: number; template: string } | null
}

export default function StrategyList({ strategies, active, onSelect }: {
  strategies: StrategyMeta[]
  active: ReviewStrategy
  onSelect: (s: ReviewStrategy) => void
}) {
  return (
    <nav aria-label="复习策略" className="flex flex-col gap-1 p-2" style={{ width: '220px', flexShrink: 0, borderRight: '1px solid var(--color-border)' }}>
      {strategies.map(s => {
        const on = s.key === active
        return (
          <button
            key={s.key}
            type="button"
            aria-current={on ? 'true' : undefined}
            onClick={() => onSelect(s.key)}
            style={{
              textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-lg)',
              padding: '8px 10px',
              background: on ? 'var(--color-brand-soft)' : 'transparent',
              color: on ? 'var(--color-brand)' : 'var(--color-text-primary)',
            }}
          >
            <span className="flex items-center gap-2">
              <span style={{ fontSize: '13px', fontWeight: 500 }}>{s.label}</span>
              <span style={{ flex: 1 }} />
              {s.count !== null && (
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{s.count}</span>
              )}
            </span>
            <span style={{ display: 'block', fontSize: '11px', marginTop: '2px', color: 'var(--color-text-secondary)' }}>
              {s.hint}
            </span>
            {s.progress && (
              <span style={{ display: 'block', marginTop: '6px' }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--color-text-secondary)' }}>
                  <span>{s.progress.index + 1} / {s.progress.total}</span>
                  <span>{s.progress.template}</span>
                </span>
                <span style={{ display: 'block', height: '2px', marginTop: '3px', background: 'var(--color-border)', borderRadius: '1px' }}>
                  <span style={{ display: 'block', width: `${((s.progress.index + 1) / s.progress.total) * 100}%`, height: '100%', background: 'var(--color-brand)', borderRadius: '1px' }} />
                </span>
              </span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
