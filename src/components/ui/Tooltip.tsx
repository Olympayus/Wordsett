import { useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { clampMenuPosition } from '../../lib/menuPosition'

interface Props { content: ReactNode; children: ReactNode; width?: number }

// 统一 hover 悬浮说明：定位 + 样式与语义网络既有 glossPop 一致（spec §4a）
export default function Tooltip({ content, children, width = 300 }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const show = (e: React.MouseEvent) => setPos({ x: e.clientX, y: e.clientY })
  const hide = () => setPos(null)
  return (
    <span style={{ display: 'inline-flex' }} onMouseEnter={show} onMouseMove={show} onMouseLeave={hide}>
      {children}
      {pos && content && createPortal(
        (() => {
          const p = clampMenuPosition(pos.x + 14, pos.y + 16, width, 160)
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