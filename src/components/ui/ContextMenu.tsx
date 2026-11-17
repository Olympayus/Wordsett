import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useClickOutside } from '../../lib/useClickOutside'
import { clampMenuPosition } from '../../lib/menuPosition'
import { scaleForAnchor, zoomOf, type OverlayScale } from '../../lib/overlayZoom'
import Icon from '../icons'

export interface MenuItem {
  key: string
  label: string
  onSelect?: () => void
  disabled?: boolean
  danger?: boolean
  children?: MenuItem[]
}

interface Props {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

const MENU_WIDTH = 168
const SUBMENU_WIDTH = 160
const ITEM_HEIGHT = 32

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [sub, setSub] = useState<string | null>(null)
  useClickOutside(ref, onClose, true)
  // 平板 zoom（v0.7.10 Task 18）：右键菜单只有指针坐标、没有锚点元素，从指针下方的元素
  // 反查缩放宿主；菜单自身要先从命中栈里排除。放在 layout effect 里，首帧上屏前就定下来，
  // 不会闪一帧未缩放的菜单。桌面 zoom = 1 → scale 为 null，无 transform。
  const [anchorZoom, setAnchorZoom] = useState<{ zoom: number; scale: OverlayScale | null }>({
    zoom: 1, scale: null,
  })
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return
    const stack = typeof document.elementsFromPoint === 'function'
      ? document.elementsFromPoint(x, y)
      : [document.elementFromPoint(x, y)]
    const anchor = stack.find(el => el && !ref.current?.contains(el)) ?? null
    const zoom = zoomOf(anchor)
    setAnchorZoom(prev => prev.zoom === zoom ? prev : { zoom, scale: scaleForAnchor(anchor) })
  }, [x, y])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onScroll = () => onClose()
    const onResize = () => onClose()
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [onClose])

  const height = items.length * ITEM_HEIGHT + 8
  const zoom = anchorZoom.zoom
  const pos = clampMenuPosition(x, y, MENU_WIDTH, height, window.innerWidth, window.innerHeight, zoom)
  // 翻转判定基于钳制后的 pos.x（原始 x 可能已被 clampMenuPosition 移入视口，导致误判）；
  // 宽度是布局尺寸，比较前换成缩放后的视觉宽度。
  const submenuOpenLeft = pos.x + (MENU_WIDTH + SUBMENU_WIDTH) * zoom + 8 > window.innerWidth

  const itemStyle = (item: MenuItem): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
    width: '100%', textAlign: 'left', padding: '0 10px', height: `${ITEM_HEIGHT}px`,
    border: 'none', background: 'transparent', borderRadius: 'var(--radius-sm)',
    cursor: item.disabled ? 'not-allowed' : 'pointer',
    color: item.danger ? 'var(--color-danger)' : (item.disabled ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)'),
    fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
    opacity: item.disabled ? 0.5 : 1,
    transition: 'background-color var(--duration-fast) var(--ease-smooth)',
  })

  return createPortal(
    <div
      ref={ref}
      style={{
        position: 'fixed', left: pos.x, top: pos.y, zIndex: 'var(--z-toast)',
        ...(anchorZoom.scale
          ? { transform: anchorZoom.scale.transform, transformOrigin: anchorZoom.scale.transformOrigin }
          : null),
        minWidth: MENU_WIDTH, padding: '4px',
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-overlay)',
      }}
    >
      {items.map(item => (
        <div
          key={item.key}
          style={{ position: 'relative' }}
          onMouseEnter={() => setSub(item.children && !item.disabled ? item.key : null)}
          onMouseLeave={() => setSub(prev => prev === item.key ? null : prev)}
        >
          <button
            type="button"
            disabled={item.disabled}
            onClick={() => { if (!item.children) { item.onSelect?.(); onClose() } }}
            style={itemStyle(item)}
          >
            <span>{item.label}</span>
            {item.children && <Icon name="chevron-right" size={14} />}
          </button>
          {sub === item.key && item.children && (
            <div style={{
              position: 'absolute', top: 0,
              left: submenuOpenLeft ? `${Math.max(-SUBMENU_WIDTH, (4 - pos.x) / zoom)}px` : '100%',
              minWidth: SUBMENU_WIDTH, padding: '4px',
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-overlay)',
            }}>
              {item.children.map(child => (
                <button
                  key={child.key}
                  type="button"
                  disabled={child.disabled}
                  onClick={() => { child.onSelect?.(); onClose() }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  style={itemStyle(child)}
                >
                  <span>{child.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>,
    document.body
  )
}
