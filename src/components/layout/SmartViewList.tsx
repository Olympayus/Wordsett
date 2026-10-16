import { SMART_VIEW_META } from '../../lib/smartViews'
import type { SmartViewKey } from '../../lib/smartViews'
import Icon from '../icons'

/** 智能视图组（v0.6.5 §4.4）：置顶四项，每项 = 图标 + 名称 + 计数徽标。
 *  点「完整词库」或再点当前视图即取消过滤（回常规浏览）。
 *
 *  间距（v0.6.5 修订）：原来容器只有左右下三个方向的内边距、项与项之间也没有任何间隙，
 *  于是一行贴一行、第一行直接顶住上面的筛选框——选中项有自己的底色与阴影，贴在一起时
 *  它和相邻项、和筛选框之间就分不出层次了。现在：上 10px 把这一组与筛选框分开，
 *  项间 2px 让相邻两项的底色框各自独立成块（v0.7.2：选中项的投影已摘除——§1.1 起靠明度
 *  分层不靠投影，选中框是白底 --color-surface，压在侧栏 --color-surface-sunken 上，实测 4.16 L*，
 *  一点余量就够。侧栏那一档面已由评审定为 sunken（spec §1.1「索引栏」），不再待定）。 */
export default function SmartViewList({ views, active, counts, onSelect }: {
  views: SmartViewKey[]
  active: SmartViewKey
  counts: Record<SmartViewKey, number>
  onSelect: (key: SmartViewKey) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '10px 6px 8px' }}>
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
              display: 'flex', alignItems: 'center', gap: '5px', width: '100%',
              padding: '6px 6px', border: 'none', borderRadius: 'var(--radius-md)',
              background: on ? 'var(--color-surface)' : 'transparent',
              cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'var(--color-surface-hover-recessed)' }}
            onMouseLeave={e => { e.currentTarget.style.background = on ? 'var(--color-surface)' : 'transparent' }}
          >
            <Icon name={meta.icon} size={13} />
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
