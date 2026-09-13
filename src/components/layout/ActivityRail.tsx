import { useViewStore } from '../../stores/viewStore'
import Icon from '../icons'

// 活动栏宽度：内容行第一列。顶栏计算搜索框可用宽度时也要算上它，故导出为常量。
export const ACTIVITY_RAIL_WIDTH = 46

// 活动栏（v0.5.2 §4）：内容行的第一列，不贯穿全高——标题栏是自绘的
// （decorations:false + data-tauri-drag-region），贯穿会撞上拖拽区与窗口按钮。
// 放进内容行后，本栏底边即窗口底边，设置按钮天然落在左下角。
// 复习按钮坑位留空：复习模块落地时插在设置按钮上方，本轮不渲染占位元素。
export default function ActivityRail() {
  const activeModule = useViewStore(s => s.activeModule)
  const showModule = useViewStore(s => s.showModule)

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