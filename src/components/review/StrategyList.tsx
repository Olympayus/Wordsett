import type { ReactNode } from 'react'
import type { ReviewStrategy } from '../../lib/review/types'

export interface StrategyMeta {
  key: ReviewStrategy
  label: string
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
            data-session-guard={`strategy:${s.key}`}
            onClick={() => onSelect(s.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              textAlign: 'left', cursor: 'pointer',
              borderRadius: 'var(--radius-md)',
              padding: '8px 10px',
              // 选中态跟随工作区侧栏：比未选中更深一档的面 + 描边 + 600，不用品牌蓝（v0.7.6）
              background: on ? 'var(--color-chrome)' : 'var(--color-surface-sunken)',
              border: `1px solid ${on ? 'var(--color-border-strong)' : 'transparent'}`,
              color: 'var(--color-text-primary)',
            }}
          >
            {/* 字体与工作区左侧栏（SmartViewList）同一套：无衬线 + --text-sm，激活时 600（v0.7.6） */}
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: on ? 'var(--weight-semibold)' : 'var(--weight-regular)', fontFamily: 'var(--font-sans)' }}>{s.label}</span>
          </button>
        )
      })}
      {footer && <div style={{ marginTop: 'auto', padding: '8px 10px 4px' }}>{footer}</div>}
    </nav>
  )
}
