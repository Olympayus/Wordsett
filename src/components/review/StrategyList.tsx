import type { ReactNode } from 'react'
import type { ReviewStrategy } from '../../lib/review/types'
import Icon from '../icons'

export interface StrategyMeta {
  key: ReviewStrategy
  label: string
  /** 该策略有进行中的会话时给出进度；就地展开在左栏条目下方 */
  progress?: { index: number; total: number; template: string } | null
}

export default function StrategyList({ strategies, active, onSelect, header, footer }: {
  strategies: StrategyMeta[]
  active: ReviewStrategy
  onSelect: (s: ReviewStrategy) => void
  /** 左栏顶部插槽（spec §3.1 的小控制台）；只放聚合量，不得含词条内容（v0.6 spec §2.2）。 */
  header?: ReactNode
  /** 左栏底部插槽；v0.6.1 起为空（掌握度分布条已由右栏的熟知度迷你图取代）。 */
  footer?: ReactNode
}) {
  return (
    <nav aria-label="复习策略" className="flex flex-col gap-1 p-2" style={{ width: '220px', flexShrink: 0, borderRight: '1px solid var(--color-border)' }}>
      {header}
      {strategies.map(s => {
        const on = s.key === active
        return (
          <button
            key={s.key}
            type="button"
            aria-current={on ? 'true' : undefined}
            onClick={() => onSelect(s.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: 'var(--radius-lg)',
              padding: '8px 10px',
              background: on ? 'var(--color-brand-soft)' : 'transparent',
              color: on ? 'var(--color-brand)' : 'var(--color-text-primary)',
            }}
          >
            <Icon name="book" size={15} />
            <span style={{ fontSize: '13px', fontWeight: 500, fontFamily: 'var(--font-serif)' }}>{s.label}</span>
            {s.progress && (
              <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--color-text-secondary)' }}>
                {s.progress.index + 1}/{s.progress.total}
              </span>
            )}
          </button>
        )
      })}
      {footer && <div style={{ marginTop: 'auto', padding: '8px 10px 4px' }}>{footer}</div>}
    </nav>
  )
}
