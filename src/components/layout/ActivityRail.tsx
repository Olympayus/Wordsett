import { useEffect, useState } from 'react'
import { useViewStore } from '../../stores/viewStore'
import Icon from '../icons'

// 活动栏宽度：内容行第一列。顶栏计算搜索框可用宽度时也要算上它，故导出为常量。
export const ACTIVITY_RAIL_WIDTH = 46

// 活动栏（v0.5.2 §4）：内容行的第一列，不贯穿全高——标题栏是自绘的
// （decorations:false + data-tauri-drag-region），贯穿会撞上拖拽区与窗口按钮。
// 放进内容行后，本栏底边即窗口底边，设置按钮天然落在左下角。
export default function ActivityRail() {
  const activeModule = useViewStore(s => s.activeModule)
  const showModule = useViewStore(s => s.showModule)

  // 今日到期数角标：进入活动栏即取一次，之后每分钟轮询（动态 import 避免拉起数据库层）
  const [badge, setBadge] = useState(0)
  useEffect(() => {
    let alive = true
    const refresh = async () => {
      const { getStrategyCounts, REVIEW_DEFAULTS } = await import('../../services/reviewService')
      const c = await getStrategyCounts(REVIEW_DEFAULTS)
      if (alive) setBadge(c.today)
    }
    refresh()
    const timer = setInterval(refresh, 60_000)
    return () => { alive = false; clearInterval(timer) }
  }, [activeModule])

  const btnStyle = (on: boolean): React.CSSProperties => ({
    width: '32px', height: '32px', flexShrink: 0,
    border: 'none', borderRadius: 'var(--radius-lg)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: on ? 'var(--color-brand-soft)' : 'transparent',
    color: on ? 'var(--color-brand)' : 'var(--color-text-secondary)',
    transition: 'background-color var(--duration-fast) var(--ease-smooth), color var(--duration-fast) var(--ease-smooth)',
  })

  return (
    <nav
      aria-label="模块"
      style={{
        width: `${ACTIVITY_RAIL_WIDTH}px`, flexShrink: 0,
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '8px 0', gap: '4px',
      }}
    >
      <button
        type="button"
        title="工作台"
        aria-label="工作台"
        aria-current={activeModule === 'workbench' ? 'page' : undefined}
        onClick={() => showModule('workbench')}
        style={btnStyle(activeModule === 'workbench')}
      >
        <Icon name="layers" size={17} />
      </button>

      <button
        type="button"
        title="复习"
        aria-label="复习"
        aria-current={activeModule === 'review' ? 'page' : undefined}
        onClick={() => showModule('review')}
        style={{ ...btnStyle(activeModule === 'review'), position: 'relative' }}
      >
        <Icon name="swap" size={17} />
        {badge > 0 && (
          <span
            aria-label={`今日剩余 ${badge} 张`}
            style={{
              position: 'absolute', top: '1px', right: '1px',
              minWidth: '14px', height: '14px', padding: '0 3px',
              borderRadius: '7px', background: 'var(--color-brand)', color: '#fff',
              fontSize: '9px', lineHeight: '14px', textAlign: 'center', fontWeight: 600,
            }}
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>

      <button
        type="button"
        title="设置"
        aria-label="设置"
        aria-current={activeModule === 'settings' ? 'page' : undefined}
        onClick={() => showModule('settings')}
        style={{ ...btnStyle(activeModule === 'settings'), marginTop: 'auto' }}
      >
        <Icon name="settings" size={17} />
      </button>
    </nav>
  )
}