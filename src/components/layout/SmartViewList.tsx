import { SMART_VIEW_META } from '../../lib/smartViews'
import type { SmartViewKey } from '../../lib/smartViews'
import Icon from '../icons'

/** 智能视图组（v0.6.5 §4.4）：置顶四项，每项 = 图标 + 名称 + 计数徽标。
 *  点「完整词库」或再点当前视图即取消过滤（回常规浏览）。 */
export default function SmartViewList({ views, active, counts, onSelect }: {
  views: SmartViewKey[]
  active: SmartViewKey
  counts: Record<SmartViewKey, number>
  onSelect: (key: SmartViewKey) => void
}) {
  return (
    <div style={{ padding: '0 6px 8px' }}>
      {views.map(key => {
        const meta = SMART_VIEW_META[key]
        const on = key === active
        return (
          <button
            key={key}
            type="button"
            aria-current={on ? 'true' : undefined}
            onClick={() => onSelect(on ? 'all' : key)}
            style={{
              display: 'flex', alignItems: 'center', gap: '7px', width: '100%',
              padding: '6px 8px', border: 'none', borderRadius: 'var(--radius-md)',
              background: on ? 'var(--color-surface)' : 'transparent',
              boxShadow: on ? 'var(--shadow-soft)' : undefined,
              cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.background = on ? 'var(--color-surface)' : 'transparent' }}
          >
            <Icon name={meta.icon} size={14} />
            <span style={{
              flex: 1, minWidth: 0, fontSize: 'var(--text-sm)',
              fontWeight: on ? 'var(--weight-semibold)' : 'var(--weight-regular)',
              color: 'var(--color-text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{meta.label}</span>
            <span className="stat-num" style={{ fontSize: 'var(--text-xs)' }}>{counts[key]}</span>
          </button>
        )
      })}
    </div>
  )
}
