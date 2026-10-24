import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { useSettingsStore } from '../../../stores/settingsStore'
import Icon from '../../icons'
import WordList, { type WordListHandle } from '../WordList'
import SidebarFooter from '../SidebarFooter'

/**
 * 手机抽屉（Task 6，spec §4.4）：从左覆盖约 **86%** 宽、右侧留遮罩；点遮罩或标题左侧的 × 关闭。
 *
 * 内容与桌面侧栏**同构**：筛选框、智能视图、分组词表、底部单词总数，全部由 `WordList`
 * 原样承担（本仓不复制正文渲染的同一条规矩，在这里同样成立——抽屉里那份列表与桌面侧栏是
 * **同一个组件**，只是 `chrome="drawer"`）。桌面侧栏的三颗工具按钮（多选 / 模式切换 / 收起）
 * 在抽屉里各有出处：多选与模式切换搬进标题右侧（桌面同款 icon 钮），收起钮没有意义
 * （抽屉的关闭由 × 与遮罩承担），故 `toolbarSlots` 在 `chrome='drawer'` 下把三颗全关掉。
 *
 * 抽屉**保持挂载**，关闭时用 `visibility` / `opacity` / `pointer-events` 隐藏——
 * 卸载会让 `WordList` 的滚动容器重建，滚动位置归零（spec §4.4「抽屉关闭再打开保留滚动位置」）。
 * 工作台与储藏库各自独立：`MobileShell` 按模块各挂一份（两份的 `WordList` 都是活的），
 * 与桌面把「切模块后滚动位置是否保留」列为已知取舍是两件不同的事：这里两份都在，谁也不覆盖谁。
 *
 * 抽屉**只挂载在词条页**（工作台 / 储藏库）：复习 / 搜索 / 设置是各自的一级页面，
 * 顶栏（以及那枚入口按钮）本来也不在那里出现。
 *
 * 层级取 `--z-modal`：与确认弹窗同档，但浮层阴影（`--shadow-overlay`）仍然成立；
 * `FindBar` 在 `--z-toast` 之上，抽屉打开时它照旧压得住（现状不变）。
 */

/** 抽屉宽度（spec §4.4：从左覆盖约 86%）。 */
const DRAWER_WIDTH = '86%'
/** 标题行的左右内边距：与底栏 / 顶栏同一档（8px），标题不贴边。 */
const TITLE_GUTTER = 8

/** 标题右侧那两枚 icon 钮：与桌面 `SidebarToolbar` 的 `iconBtn` 同形（30px 命中区、hover 才起底）。 */
const iconBtn = (): CSSProperties => ({
  width: '30px', height: '30px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', background: 'transparent', borderRadius: 'var(--radius-md)', cursor: 'pointer',
  flexShrink: 0,
  color: 'var(--color-text-secondary)',
  transition: 'background-color var(--duration-fast) var(--ease-smooth), color var(--duration-fast) var(--ease-smooth)',
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
})

// iconBtn 的 transition 只声明了这两条属性，得有东西去改它们才有动画；
// 否则按钮连底色都不变，看起来像坏的（与 `SidebarToolbar` 的三颗图标钮同一配方）。
const hoverOn = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.background = 'var(--color-surface-hover-recessed)'
  e.currentTarget.style.color = 'var(--color-text-primary)'
}
const hoverOff = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.background = 'transparent'
  e.currentTarget.style.color = 'var(--color-text-secondary)'
}

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * 抽屉主体。`open` 为假时**仍然渲染**（只换样式，见文件头）。
 *
 * 多选经 `WordList` 的 `ref` 交出（`WordListHandle.toggleSelectMode`）——选择模式的
 * 状态只存在于 `WordList` 体内，标题上那枚钮不复制它。模式切换走 `useSettingsStore`
 * 的 `sidebarMode`，与桌面侧栏、`AppShell` 同一份来源（`setSidebarMode`），两处不可能分家。
 */
export default function MobileDrawer({ open, onClose }: Props) {
  const listRef = useRef<WordListHandle>(null)
  const mode = useSettingsStore(s => s.sidebarMode)
  const setSidebarMode = useSettingsStore(s => s.setSidebarMode)

  // 关闭时把焦点还给顶栏那枚抽屉钮——抽屉整体 `visibility: hidden`，留在里面的焦点
  // 会跟着一起看不见（键盘用户会掉进一个「屏幕上有焦点却看不见」的状态）。
  // 打开时不抢焦点：抢了会让软键盘 / 页面滚动的既有行为变样，而 × 与遮罩都已可点。
  //
  // `wasOpen` 是必须的：抽屉**常挂**，挂载那一刻 `open` 就是 false，没有这道门的话
  // 启动时会把焦点抢到抽屉钮上（那时用户还没开过抽屉），两份抽屉各抢一次。
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open) { wasOpen.current = true; return }
    if (!wasOpen.current) return
    wasOpen.current = false
    document.getElementById('mobile-drawer-open')?.focus()
  }, [open])

  // `inert` 让关闭期间整棵子树退出 Tab 序列与无障碍树。用 effect 写属性而不是 JSX 布尔：
  // React 18 对布尔 `inert` 会告警，而本仓其余「关掉整棵子树」的地方用的是同一条路
  // （`visibility: hidden` + `pointer-events: none`），这里补上第三个同样的手段。
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    rootRef.current?.toggleAttribute('inert', !open)
  }, [open])

  // Esc 关闭（spec §5.5 返回栈第 3 位：关闭抽屉优先于一切页内返回）。
  // 本仓既有做法是各组件各自挂 window 级监听（词条卡浮层、词典返回页、`WordList` 的选中态），
  // 抽屉照同一套路；`WordList` 在选中模式下也听 Esc，但它的监听只在 `selectMode` 时才挂，
  // 两者唯一会同时命中的场合是「选中模式下按 Esc」——那时抽屉关不关都无关紧要，
  // 而选择模式的清空由 `WordList` 自己负责，顺序不影响结果。
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="词库"
      // 覆盖层：absolute 而不是 fixed——外壳的根是一列 flex，`inset: 0` 就是那一屏。
      // fixed 需要逐字写四条边，且它会相对视口取位，与外壳的对齐方式分叉。
      className="absolute inset-0"
      style={{
        zIndex: 'var(--z-modal)',
        // 关闭时三件套：不可见、不可点、不接指针。`inert` 让隐藏期间整棵子树退出 Tab 序列
        // （`visibility: hidden` 本身已让子孙不可聚焦，但 Safari 上仍会命中，两者都写才稳）。
        visibility: open ? 'visible' : 'hidden',
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity var(--duration-fast) var(--ease-smooth)',
        display: 'flex',
      }}
    >
      {/* 遮罩：占满抽屉右侧的那 14%，也兜住抽屉本身之外的整屏（spec §4.4「点遮罩关闭」）。
          **没有可及名、也不进 Tab 序列**（`aria-hidden` + `tabIndex={-1}`）：点它等于关闭，
          而「关闭」已由标题那枚带 aria-label 的 × 承载——再给遮罩一个名字，读屏用户会在
          对话框里读到两个「关闭」。点遮罩关闭是**鼠标 / 触摸**的便利，不是键盘路径。 */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        style={{
          flex: '1 1 auto', minWidth: 0, border: 'none', padding: 0, cursor: 'pointer',
          background: 'var(--color-scrim)',
          touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent',
        }}
      />

      {/* 抽屉面板：86% 宽（按父级宽度算，父级即外壳那一屏）。 */}
      <div
        className="flex flex-col overflow-hidden"
        style={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          // 与桌面侧栏同档面（--color-surface-sunken，索引栏）
          background: 'var(--color-surface-sunken)',
          borderRight: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-overlay)',
        }}
      >
        {/* 标题行：× ／「词库」／ 多选 ／ 模式切换。标题右侧不放 ⋯——桌面没有对应条目，不新造菜单（spec §4.4）。 */}
        <div
          className="shrink-0 flex items-center"
          style={{
            height: '52px', gap: 2, padding: `0 ${TITLE_GUTTER}px`,
            background: 'var(--color-chrome)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <button type="button" title="关闭" aria-label="关闭" onClick={onClose}
            onMouseEnter={hoverOn} onMouseLeave={hoverOff} style={iconBtn()}>
            <Icon name="close" size={17} />
          </button>
          <div
            style={{
              flex: '1 1 auto', minWidth: 0, margin: '0 2px',
              fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 600,
              color: 'var(--color-text-primary)', lineHeight: 1.2, whiteSpace: 'nowrap',
            }}
          >
            词库
          </div>
          {/* 多选 / 模式切换：桌面同款 icon 钮（`SidebarToolbar` 的 `iconBtn` 配方），
              只是宿主从侧栏工具条换成抽屉标题。多选经 ref 进 `WordList`，模式切换走 store。 */}
          <button type="button" title="多选" aria-label="多选" aria-pressed={false}
            onClick={() => listRef.current?.toggleSelectMode()}
            onMouseEnter={hoverOn} onMouseLeave={hoverOff} style={iconBtn()}>
            <Icon name="check-square" size={16} />
          </button>
          <button type="button" title="切换显示模式" aria-label="切换显示模式"
            onClick={() => setSidebarMode(mode === 'alphabet' ? 'category' : 'alphabet')}
            onMouseEnter={hoverOn} onMouseLeave={hoverOff} style={iconBtn()}>
            <Icon name="swap" size={16} />
          </button>
        </div>

        {/* 词表：与桌面侧栏同一个组件（`chrome="drawer"` 只影响工具条的槽位，见文件头）。
            `collapsed={false}`：抽屉没有收起态。 */}
        <WordList
          ref={listRef}
          chrome="drawer"
          collapsed={false}
          onToggleCollapse={() => {}}
          mode={mode}
          onToggleMode={() => setSidebarMode(mode === 'alphabet' ? 'category' : 'alphabet')}
        />
        <SidebarFooter collapsed={false} />
      </div>
    </div>
  )
}
