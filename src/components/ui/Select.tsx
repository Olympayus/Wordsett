import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../icons'
import { useMobilePopup } from '../../lib/mobilePopups'
import { scaleForAnchor, zoomOf } from '../../lib/overlayZoom'
import { nextIndex } from './selectNav'

export interface SelectOption { value: string; label: string }

export interface SelectPosition { left: number; top: number; width: number; maxHeight: number }

/** 触发器宽度。v0.7.10 替换原生 `<select>` 时沿用它的 240px（桌面零回归）；
 *  v0.7.10 收尾按用户要求加宽到 380——系统音色名（如
 *  「Microsoft Zira Desktop - English (United States)」）在 240px 里会被省略号截断。
 *  展开面板与触发器同宽，长音色名因此也能在列表里读全。 */
const TRIGGER_WIDTH = 380
/** 浮层与锚点之间的缝隙；浮层与视口边缘之间的最小余量。 */
const LISTBOX_GAP = 4
const LISTBOX_MARGIN = 8

/**
 * 浮层落点（纯函数，坐标一律是视口视觉 CSS 像素）。
 *
 * 贴着触发器的视口矩形下方，横向左对齐并在窄窗口下推回视口内。
 *
 * **平板 zoom（v0.7.10 Task 18）**：锚点矩形是视觉坐标，而 portal 面板的 `width` /
 * `maxHeight` 是布局尺寸、会被 `scale(zoom)` 缩回视觉尺寸——故布局宽度按 `1 / zoom`
 * 放大，视觉宽度才与触发器一致；可用高度同理换算回布局高度。`zoom` 默认 1，桌面不变。
 */
export function selectListboxPosition(
  anchor: { left: number; right: number; bottom: number }, vw: number, vh: number, zoom = 1,
): SelectPosition {
  const width = Math.min(
    (anchor.right - anchor.left) / zoom,
    Math.max(0, vw - LISTBOX_MARGIN * 2) / zoom,
  )
  const visualWidth = width * zoom
  const left = Math.max(LISTBOX_MARGIN, Math.min(anchor.left, vw - LISTBOX_MARGIN - visualWidth))
  const top = anchor.bottom + LISTBOX_GAP
  return { left, top, width, maxHeight: Math.max(0, vh - top - LISTBOX_MARGIN) / zoom }
}

/**
 * 自绘下拉（v0.7.10 Task 14）：替换语音分区里那枚原生 `<select>`。
 *
 * **为什么自绘**：原生 `<select>` 的展开面板由系统绘制，字号 / 配色 / 阴影都不归我们管，
 * 深色模式下也与全站浮层不同族。触发器沿用原 `<select>` 的尺寸与观感（240 宽、5px 8px
 * padding、radius-lg、`--color-border-strong`、13px、surface 底），展开面板走 portal +
 * `--shadow-overlay`（全站唯一阴影，浮层合规）。
 *
 * 键盘：↑↓ 循环（`nextIndex` 纯函数）、Enter 选中、Esc 关闭、Tab / 点外关闭；焦点始终留在
 * 触发器上，高亮项由 `aria-activedescendant` 指给读屏器。浮层打开时登记进 `useMobilePopup`，
 * Android 返回键可以关掉它——本轮唯一调用点是桌面语音音色，这条登记是白送的兼容。
 *
 * **不做触摸分支**：唯一调用点按 `isDesktop` 传 desktop 形态，Android（手机或平板）不渲染
 * 本组件；触摸端的开合语义留给移动外壳的底部表，而不是往这里塞第二套手势。
 */
export default function Select({ value, options, onChange, disabled = false, ariaLabel }: {
  value: string
  options: SelectOption[]
  onChange: (v: string) => void
  disabled?: boolean
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  // null = 还没量到（首帧隐形渲染，量完再落位），避免面板先闪在左上角再跳到触发器下方。
  const [pos, setPos] = useState<SelectPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const baseId = useId()
  const listId = `${baseId}-listbox`

  const selected = options.findIndex(o => o.value === value)
  const currentLabel = selected >= 0 ? options[selected].label : value
  // 平板 zoom：面板脱离缩放子树后按 1:1 渲染，套上 scale(zoom) 才与周围同尺寸；
  // 桌面 zoom === 1 时为 null，不产生 transform（逐字不变）。
  const scale = open ? scaleForAnchor(triggerRef.current) : null

  const close = useCallback(() => setOpen(false), [])
  useMobilePopup(open, close)

  const openList = () => {
    if (disabled) return
    setActive(selected >= 0 ? selected : 0)
    setOpen(true)
  }

  const choose = (index: number) => {
    const opt = options[index]
    if (!opt) return
    // 与原生 change 事件同一语义：选中同一项不算一次变更。
    if (opt.value !== value) onChange(opt.value)
    setOpen(false)
  }

  // 落点：打开时量一次，滚动 / 改宽时重算（锚点会跟着设置页的滚动容器移动）。
  // 平板 zoom 下锚点矩形已是视觉坐标，再补一个 zoom 让面板尺寸换算正确。
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const el = triggerRef.current
      if (!el) return
      setPos(selectListboxPosition(
        el.getBoundingClientRect(), window.innerWidth, window.innerHeight, zoomOf(el),
      ))
    }
    place()
    window.addEventListener('resize', place)
    // capture 才能收到内层滚动容器（设置页的 <main>）的滚动。
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  // 点外关闭：pointerdown 早于 click，点触发器本身不算「外面」（交给 onClick 开合）。
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (listRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open])

  // 高亮项滚动进可视区（↑↓ 越过面板可见高度时）。
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return
    if (!open) {
      // 关闭态按 ↑↓ 直接展开（原生 select 的习惯）；Enter / Space 走按钮自己的点击开合。
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        openList()
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActive(i => nextIndex(i, 1, options.length))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActive(i => nextIndex(i, -1, options.length))
        break
      case 'Enter':
      case ' ':
        // preventDefault 同时挡掉按钮的合成 click——否则选完后那次 click 会把面板再打开。
        e.preventDefault()
        choose(active)
        break
      case 'Escape':
        e.preventDefault()
        // 与原生 select 一致：展开时的 Esc 只关面板，不让上层（编辑确认等）再收到一次。
        e.stopPropagation()
        setOpen(false)
        break
      case 'Tab':
        // 不拦 Tab：焦点该照常离开，浮层跟着收起即可。
        setOpen(false)
        break
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        // 语义按 ARIA 的 select-only combobox：元素仍是原生 button（Enter / Space 的激活
        // 行为照旧），但读屏器把它读成「下拉」，`aria-activedescendant` 才有合法落点。
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${baseId}-opt-${active}` : undefined}
        disabled={disabled}
        onClick={() => { if (open) setOpen(false); else openList() }}
        onKeyDown={onKeyDown}
        style={{
          width: TRIGGER_WIDTH, boxSizing: 'border-box', padding: '5px 8px',
          borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-strong)',
          background: 'var(--color-surface)', color: 'var(--color-text-primary)',
          fontSize: 13, fontFamily: 'var(--font-sans)', textAlign: 'left',
          display: 'flex', alignItems: 'center', gap: 6,
          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {currentLabel}
        </span>
        <span aria-hidden="true" style={{ display: 'inline-flex', flexShrink: 0, color: 'var(--color-text-tertiary)' }}>
          <Icon name="chevron" size={12} />
        </span>
      </button>

      {open && createPortal(
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          // 点选项不让触发器失焦：焦点留在按钮上，键盘与 aria-activedescendant 才不会断。
          onMouseDown={e => e.preventDefault()}
          style={{
            position: 'fixed',
            ...(scale ? { transform: scale.transform, transformOrigin: scale.transformOrigin } : null),
            zIndex: 'var(--z-dropdown)',
            left: pos ? pos.left : 0,
            top: pos ? pos.top : 0,
            width: pos ? pos.width : TRIGGER_WIDTH,
            maxHeight: pos ? pos.maxHeight : undefined,
            visibility: pos ? 'visible' : 'hidden',
            overflowY: 'auto',
            boxSizing: 'border-box',
            padding: 4,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-overlay)',
          }}
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value
            const isActive = i === active
            return (
              <div
                key={opt.value}
                id={`${baseId}-opt-${i}`}
                role="option"
                aria-selected={isSelected}
                data-index={i}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
                style={{
                  padding: '6px 8px', borderRadius: 'var(--radius-md)',
                  fontSize: 13, fontFamily: 'var(--font-sans)', lineHeight: 1.4,
                  color: 'var(--color-text-primary)',
                  background: isActive ? 'var(--color-surface-hover)' : 'transparent',
                  fontWeight: isSelected ? 600 : 400,
                  cursor: 'pointer',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {opt.label}
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}
