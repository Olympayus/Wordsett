import type { ReactNode } from 'react'
import type { ReviewStrategy } from '../../lib/review/types'

export interface StrategyMeta {
  key: ReviewStrategy
  label: string
}

export default function StrategyList({ strategies, active, onSelect, header, start, footer }: {
  strategies: StrategyMeta[]
  active: ReviewStrategy
  onSelect: (s: ReviewStrategy) => void
  /** 左栏顶部插槽（spec §3.1 的小控制台）；只放聚合量，不得含词条内容（v0.6 spec §2.2）。 */
  header?: ReactNode
  /**
   * 控制台与策略项之间的插槽（v0.7.10 §6.5）：桌面「开始复习 / 开始练习」按钮由
   * `ReviewModule` 组装后从这里传入（按钮要读库、写会话 store，列表只负责摆位置）。
   * 缺省不渲染——手机分支根本不渲染本组件，故插槽不影响手机布局。
   */
  start?: ReactNode
  /** 左栏底部插槽；v0.6.1 起为空（掌握度分布条已由右栏的熟知度迷你图取代）。 */
  footer?: ReactNode
}) {
  return (
    <nav aria-label="复习策略" className="flex flex-col gap-1 p-2" style={{ width: '220px', flexShrink: 0, borderRight: '1px solid var(--color-border)' }}>
      {header}
      {start}
      {strategies.map(s => {
        const on = s.key === active
        return (
          <button
            key={s.key}
            type="button"
            aria-current={on ? 'true' : undefined}
            data-session-guard={`strategy:${s.key}`}
            onClick={() => onSelect(s.key)}
            // 选中态与工作区侧栏的智能视图（SmartViewList）同一套逻辑：白面 + 强描边 + 600，
            // 未选中透明、悬停走 recessed 一档。左侧导航的「当前项」一律靠面与描边表达，
            // 刻意不用品牌蓝（v0.7.6；用户确认与复习区智能视图一致）。
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              textAlign: 'left', cursor: 'pointer',
              borderRadius: 'var(--radius-md)',
              padding: '8px 10px',
              border: `1px solid ${on ? 'var(--color-border-strong)' : 'transparent'}`,
              background: on ? 'var(--color-surface)' : 'transparent',
              color: 'var(--color-text-primary)',
            }}
            onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'var(--color-surface-hover-recessed)' }}
            onMouseLeave={e => { e.currentTarget.style.background = on ? 'var(--color-surface)' : 'transparent' }}
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
