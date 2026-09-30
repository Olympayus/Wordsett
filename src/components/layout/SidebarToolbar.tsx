import Icon from '../icons'

/** 第一行里各控件的显隐规则。抽成纯函数是为了可测——node 环境测不到 DOM。 */
export function toolbarSlots({ selectMode }: { collapsed: boolean; selectMode: boolean }): {
  selectToggle: boolean; modeToggle: boolean; collapseToggle: boolean; filterInput: boolean
} {
  return {
    // 收起态**不**再关掉任何功能（v0.6.5 §4.1）：放不下交给宽度与换行，
    // 不再用 collapsed 这个布尔量去决定「能不能用」。collapsed 仍留在入参类型里
    // （调用方照旧要传），只是不再参与判定——这正是本条规则本身。
    selectToggle: !selectMode,
    modeToggle: !selectMode,
    collapseToggle: true,
    filterInput: true,
  }
}

interface Props {
  collapsed: boolean
  filter: string
  onFilterChange: (value: string) => void
  onToggleMode: () => void
  onToggleCollapse: () => void
  selectMode: boolean
  onToggleSelectMode: () => void
  selectedCount: number
  onSelectAll: () => void
  /** 取消全部勾选（v0.6.5 修订）。与「退出」分开：清空后仍留在选择模式，
   *  「筛一批 → 全选 → 发现选多了 → 清空 → 再 Shift 范围选」这条动线不用绕出模式再进来。 */
  onClearAll: () => void
  onExitSelect: () => void
}

const iconBtn = (on = false): React.CSSProperties => ({
  width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', background: on ? 'var(--color-brand-soft)' : 'transparent',
  borderRadius: 'var(--radius-md)', cursor: 'pointer', flexShrink: 0,
  color: on ? 'var(--color-brand)' : 'var(--color-text-secondary)',
  transition: 'background-color var(--duration-fast) var(--ease-smooth), color var(--duration-fast) var(--ease-smooth)',
})

// iconBtn 的 transition 只声明了这两条属性，得有东西去改它们才有动画；
// 否则按钮连底色都不变，看起来像坏的。三颗图标钮共用这一对。
const hoverOn = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.background = 'var(--color-surface-hover)'
  e.currentTarget.style.color = 'var(--color-brand)'
}
const hoverOff = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.background = 'transparent'
  e.currentTarget.style.color = 'var(--color-text-secondary)'
}

const chip: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', height: '26px', padding: '0 9px',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
  background: 'var(--color-surface-raised)', color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)',
  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
}

// 侧栏工具条（v0.6.5 §4.1）：两行。第一行是控件、第二行是整宽筛选框。
// 按钮独立成行后，选择模式只需替换第一行，筛选框原地不动——这是把「筛一批 → 全选 → 批量归类」
// 这条动线留住的关键：筛选框在选择模式下仍然可用，且全选的作用域就是筛出来的那些行。
export default function SidebarToolbar({
  collapsed, filter, onFilterChange, onToggleMode, onToggleCollapse,
  selectMode, onToggleSelectMode, selectedCount, onSelectAll, onClearAll, onExitSelect,
}: Props) {
  const slots = toolbarSlots({ collapsed, selectMode })
  return (
    <div className="shrink-0" style={{ padding: '10px 10px 0' }}>
      {/* 第一行：控件。角色分工固定——左侧是「模式类」，右端是「窗口类」。
          两个分支都按 slots 取，不要按 selectMode 取——分支条件与实际渲染的槽位
          必须是同一个来源，否则 slots 里的 collapseToggle: true 会变成一个
          没有任何渲染消费它的常量，选择模式下收起钮也就此消失。 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
        {slots.selectToggle ? (
          <>
            <button type="button" title="多选" aria-label="多选" aria-pressed={false}
              onClick={onToggleSelectMode} onMouseEnter={hoverOn} onMouseLeave={hoverOff}
              style={iconBtn()}>
              <Icon name="check-square" size={16} />
            </button>
            {slots.modeToggle && (
              <button type="button" title="切换显示模式" aria-label="切换显示模式"
                onClick={onToggleMode} onMouseEnter={hoverOn} onMouseLeave={hoverOff}
                style={iconBtn()}>
                <Icon name="swap" size={16} />
              </button>
            )}
          </>
        ) : (
          <>
            <span style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
              已选 <span className="stat-num">{selectedCount}</span>
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button type="button" style={chip} onClick={onSelectAll}>全选</button>
              <button type="button" style={chip} onClick={onClearAll}>清空</button>
              <button type="button" style={chip} onClick={onExitSelect}>退出</button>
            </div>
          </>
        )}
        {/* 收起钮在两态都在：选择模式下若把它连同第一行一起换掉，收起态（最窄 120px）
            就失去了唯一的逃生口——恰恰是最该能撑开侧栏的时候动不了。 */}
        <div style={{ marginLeft: 'auto' }}>
          {slots.collapseToggle && (
            <button type="button" title="收起/展开侧边栏" aria-label="收起/展开侧边栏"
              onClick={onToggleCollapse} onMouseEnter={hoverOn} onMouseLeave={hoverOff}
              style={iconBtn()}>
              <span style={{
                display: 'flex',
                transition: 'transform var(--duration-normal) var(--ease-smooth)',
                transform: collapsed ? 'rotate(180deg)' : undefined,
              }}>
                <Icon name="chevron-left" size={16} />
              </span>
            </button>
          )}
        </div>
      </div>

      {/* 第二行：整宽筛选框。收起态也渲染——它不再是个图标。 */}
      {slots.filterInput && (
        <div
          className="flex items-center gap-2"
          style={{
            height: '32px', padding: '0 10px', marginTop: '8px',
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            transition: 'border-color var(--duration-fast) var(--ease-smooth)',
          }}
        >
          <Icon name="search" size={15} />
          <input
            type="text"
            placeholder="筛选词库..."
            value={filter}
            onChange={e => onFilterChange(e.target.value)}
            onFocus={e => { e.currentTarget.parentElement!.style.borderColor = 'var(--color-brand)' }}
            onBlur={e => { e.currentTarget.parentElement!.style.borderColor = 'var(--color-border)' }}
            style={{
              flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)',
            }}
          />
        </div>
      )}
    </div>
  )
}
