import { useRef } from 'react'
import Icon from '../icons'
import ClearButton from '../ui/ClearButton'
import { hasCoarsePointer } from '../../lib/pointer'
import { touchInputStyles } from '../../lib/touchInput'

/** 第一行里各控件的显隐规则。抽成纯函数是为了可测——node 环境测不到 DOM。
 *  `chrome='drawer'`（Task 6 的 `MobileDrawer`）是第一行的**第三种**形态：那三颗按钮
 *  在抽屉里另有出处（标题右侧的两枚同款 icon 钮，见 `MobileDrawer`），故第一行整段让位，
 *  只留筛选框——分支条件与渲染分支是同一个来源（见下方三元）。
 *
 * 入参按 interface 取而不是逐个解构：`collapsed` 刻意**不参与判定**（v0.6.5 §4.1 的规矩，
 *  见下方注释），但调用方照旧要传。 */
export function toolbarSlots({ selectMode, chrome = 'sidebar' }: {
  collapsed: boolean
  selectMode: boolean
  chrome?: 'sidebar' | 'drawer'
}): {
  selectToggle: boolean; modeToggle: boolean; collapseToggle: boolean; filterInput: boolean
  selectBar: boolean
} {
  // 抽屉模式：收起钮在抽屉里没有意义（抽屉的关闭由标题左侧那枚 × 与遮罩承担），
  // 多选钮与模式钮搬进抽屉标题，故三个按钮位全 false、筛选框照旧。
  if (chrome === 'drawer') {
    return {
      selectToggle: false,
      modeToggle: false,
      collapseToggle: false,
      filterInput: true,
      selectBar: selectMode,
    }
  }
  return {
    // 收起态**不**再关掉任何功能（v0.6.5 §4.1）：放不下交给宽度与换行，
    // 不再用 collapsed 这个布尔量去决定「能不能用」。collapsed 仍留在入参类型里
    // （调用方照旧要传），只是不再参与判定——这正是本条规则本身。
    selectToggle: !selectMode,
    modeToggle: !selectMode,
    collapseToggle: true,
    filterInput: true,
    selectBar: selectMode,
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
  /** 宿主形态：`'drawer'` 时第一行的三颗按钮让位（抽屉标题右侧另有同款两枚）。 */
  chrome?: 'sidebar' | 'drawer'
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
// hover 转主文字色（v0.7.2 §6 规则 2：蓝不做「可点」的通用提示，不再是 brand）。
const hoverOn = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.background = 'var(--color-surface-hover-recessed)'
  e.currentTarget.style.color = 'var(--color-text-primary)'
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
  chrome,
}: Props) {
  const slots = toolbarSlots({ collapsed, selectMode, chrome })
  const inputRef = useRef<HTMLInputElement>(null)
  // 触摸输入档（v0.7.10 §7.4）：本组件在侧栏与手机抽屉两处挂载、没有 `touch` prop，
  // 故判据取主指针（`hasCoarsePointer()`；无 matchMedia 的环境返回 false）。两种外壳
  // 共用同一个值，不按 `chrome` 再分一套。
  const touch = hasCoarsePointer()
  const touchStyle = touchInputStyles(touch)
  return (
    <div className="shrink-0" style={{ padding: '10px 10px 0' }}>
      {/* 第一行：控件。角色分工固定——左侧是「模式类」，右端是「窗口类」。
          三个分支都按 slots 取，不要按 selectMode 取——分支条件与实际渲染的槽位
          必须是同一个来源，否则 slots 里的 collapseToggle: true 会变成一个
          没有任何渲染消费它的常量，选择模式下收起钮也就此消失。
          抽屉模式（chrome='drawer'）三个槽位皆 false → 第一行整段不渲染：那两颗
          模式钮在抽屉标题右侧另有一份（`MobileDrawer`），收起钮在抽屉里没有意义。 */}
      {(slots.selectToggle || slots.selectBar) && (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
        {slots.selectToggle ? (
          <>
            <button type="button" aria-label="多选" aria-pressed={false}
              onClick={onToggleSelectMode} onMouseEnter={hoverOn} onMouseLeave={hoverOff}
              style={iconBtn()}>
              <Icon name="check-square" size={16} />
            </button>
            {slots.modeToggle && (
              <button type="button" aria-label="切换显示模式"
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
            <button type="button" aria-label="收起/展开侧边栏"
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
      )}

      {/* 第二行：整宽筛选框。收起态也渲染——它不再是个图标。 */}
      {slots.filterInput && (
        <div
          className="flex items-center gap-2"
          style={{
            height: '32px', padding: '0 10px', marginTop: '8px',
            // 触摸档下高度交给输入框（minHeight 40）撑开，32px 的桌面高度让位。
            ...(touch ? { height: 'auto' } : null),
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            transition: 'border-color var(--duration-fast) var(--ease-smooth)',
          }}
        >
          <Icon name="search" size={15} />
          <input
            ref={inputRef}
            type="text"
            placeholder="筛选词库..."
            value={filter}
            onChange={e => onFilterChange(e.target.value)}
            onFocus={e => { e.currentTarget.parentElement!.style.borderColor = 'var(--color-brand)' }}
            onBlur={e => { e.currentTarget.parentElement!.style.borderColor = 'var(--color-border)' }}
            style={{
              flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)',
              // 触摸档（v0.7.10 §7.4）：16px 防 iOS 聚焦缩放、minHeight 40 撑满筛选条；
              // 横向留白由外层那圈 10px 负责，内层归零。
              ...touchStyle, ...(touch ? { padding: 0 } : null),
            }}
          />
          <ClearButton
            visible={filter.length > 0}
            onClick={() => { onFilterChange(''); inputRef.current?.focus() }}
          />
        </div>
      )}
    </div>
  )
}
