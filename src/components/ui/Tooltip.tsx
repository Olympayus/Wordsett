import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { clampMenuPosition } from '../../lib/menuPosition'

interface Props {
  content: ReactNode
  children: ReactNode
  width?: number
  /**
   * v0.6.3 条目 10：true = 点击开合（并支持 Esc 关闭），false = 仅悬停。
   * 默认 false 保持既有三个调用点（自由练习不计分提示、语义网络 gloss、WordTitleExtras）行为不变。
   * 无论哪个模式，**聚焦都打开**——只挂 hover 的话键盘用户够不到。
   */
  click?: boolean
}

// 统一悬浮说明：定位 + 样式与语义网络既有 glossPop 一致（spec §4a）
export default function Tooltip({ content, children, width = 300, click = false }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  // Esc 关闭用一个独立开关，不动 pos（pos 还要留给定位）
  const [escClosed, setEscClosed] = useState(false)
  const hostRef = useRef<HTMLSpanElement>(null)

  // 嵌套 Tooltip：光标落在子级触发器内时（closest 命中 ≠ 自身 currentTarget）不打开，避免双层 portal 叠加
  const show = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement | null
    if (t?.closest('[data-tooltip-trigger]') !== e.currentTarget) return
    setEscClosed(false)
    setPos({ x: e.clientX, y: e.clientY })
  }
  const hide = () => setPos(null)

  // 聚焦打开：没有鼠标坐标可用，位置取触发器自身的包围盒左下
  const showAtHost = () => {
    const el = hostRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setEscClosed(false)
    setPos({ x: r.left, y: r.bottom })
  }

  useEffect(() => {
    if (!click || pos === null) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setEscClosed(true) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [click, pos])

  const open = pos !== null && !escClosed

  return (
    <span
      ref={hostRef}
      style={{ display: 'inline-flex' }}
      data-tooltip-trigger
      onMouseEnter={show}
      onMouseMove={show}
      onMouseLeave={hide}
      onFocus={showAtHost}
      onBlur={hide}
      onClick={click ? (e: React.MouseEvent) => { e.stopPropagation(); if (open) hide(); else showAtHost() } : undefined}
    >
      {children}
      {open && content && createPortal(
        (() => {
          const p = clampMenuPosition(pos!.x + 14, pos!.y + 16, width, 160)
          return (
            <div style={{
              position: 'fixed', left: p.x, top: p.y, zIndex: 'var(--z-dropdown)',
              maxWidth: width, padding: '8px 12px',
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-overlay)',
              fontSize: 12, lineHeight: 1.6, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)',
            }}>
              {content}
            </div>
          )
        })(),
        document.body
      )}
    </span>
  )
}
