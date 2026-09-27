import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { clampMenuPosition } from '../../lib/menuPosition'

interface Props {
  content: ReactNode
  children: ReactNode
  width?: number
  /**
   * v0.6.3 条目 10：true = 点击开合（并支持 Esc / 点外面关闭），false = 仅悬停。
   * 默认 false 保持既有五个调用点（`FreeScopePanel` 的不计分提示、`SemanticNetwork` 的
   * 三处 gloss / 关系说明、`WorkbenchNavBar` 的合并添加）行为与改前逐字不变。
   * 无论哪个模式，**聚焦都打开**——只挂 hover 的话键盘用户够不到。
   */
  click?: boolean
}

// 统一悬浮说明：定位 + 样式与语义网络既有 glossPop 一致（spec §4a）
export default function Tooltip({ content, children, width = 300, click = false }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  // 「已被用户显式关掉、指针还没离开触发器」。Esc 与点回触发器都置位，
  // **只由指针进出触发器（mouseEnter / mouseLeave）或再次点开来解除**——
  // 改前是每次 mousemove 都把 Esc 的开关抹掉，于是 Esc 之后光标在图标上挪一下，窗口就自己回来了。
  // 只有 click 模式会置位，悬停模式下恒为 false，故下面 show 里的判据对悬停模式是死代码。
  const [dismissed, setDismissed] = useState(false)
  const hostRef = useRef<HTMLSpanElement>(null)
  // 「紧随这次 mousedown 的那次 click 只是开窗的收尾，别当成用户要关」。
  // 用 ref 而非 state：两次派发之间隔着的那次 setState 还没落到 DOM 事件上。
  const clickPendingRef = useRef(false)

  // 嵌套 Tooltip：光标落在子级触发器内时（closest 命中 ≠ 自身 currentTarget）不打开，避免双层 portal 叠加
  const showAt = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement | null
    if (t?.closest('[data-tooltip-trigger]') !== e.currentTarget) return
    setPos({ x: e.clientX, y: e.clientY })
  }
  // 指针在触发器内移动：已关掉就不顶回来
  const show = (e: React.MouseEvent) => {
    if (dismissed) return
    showAt(e)
  }
  // 指针离开触发器 = 用户已经移开了，连同「已关掉」的标记一起解除，下次再回来照常打开
  const onLeave = () => {
    setDismissed(false)
    clickPendingRef.current = false
    setPos(null)
  }
  // 聚焦打开：没有鼠标坐标可用，位置取触发器自身的包围盒左下
  const showAtHost = () => {
    const el = hostRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ x: r.left, y: r.bottom })
  }

  const open = pos !== null

  useEffect(() => {
    if (!click || !open) return
    // Esc 与「点外面」都只是「我不看了」：关掉，并同样置 dismissed，
    // 免得指针此刻正停在 ⓘ 上、下一次 mousemove 又把窗口顶回来。
    // 点外面挂在 document 的**捕获**阶段：触发器内部那次 click 会被 stopPropagation 吞在后面，
    // 能在捕获阶段走到这里的必然是外部点击，不会自己把自己关掉。
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setDismissed(true); setPos(null) } }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node | null
      if (t && hostRef.current?.contains(t)) return
      setDismissed(true)
      setPos(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown, true)
    }
    // 依赖 open 而非 pos：pos 每次 mousemove 都在变，而闭包只用 hostRef，
    // 挂在开窗状态上就够，不必跟着指针位置反复拆装监听。
  }, [click, open])

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    // 点按钮的顺序是 mousedown → focus → click：焦点那次已经把说明窗开出来了，
    // 这次 click 是它的收尾而非「用户要关」——吃掉标记，单击一次就开得出（改前要点两下）。
    if (clickPendingRef.current) {
      clickPendingRef.current = false
      return
    }
    // 其余按开关处理：鼠标的第二下，以及键盘 Enter / 空格（无 mousedown，走不到上一段）
    if (open) {
      setDismissed(true)
      setPos(null)
    } else {
      setDismissed(false)
      showAtHost()
    }
  }

  return (
    <span
      ref={hostRef}
      style={{ display: 'inline-flex' }}
      data-tooltip-trigger
      onMouseDown={click ? () => {
        // 焦点若还在触发器之外，这次按下会把焦点挪进来——focus 在 click 之前派发并开窗，
        // 随后的 click 因此只是收尾。焦点已在触发器里则不会再有 focus，这次 click 就是用户按的开关。
        const active = document.activeElement
        clickPendingRef.current = !(hostRef.current?.contains(active ?? null) ?? false)
      } : undefined}
      // 重新进入触发器才算「用户又看过来了」；留在原地挪动（mousemove）不算，故只在 enter 里解除 dismissed
      onMouseEnter={e => { setDismissed(false); showAt(e) }}
      onMouseMove={show}
      onMouseLeave={onLeave}
      // focus / blur 是冒泡事件：子元素（本文档的 ⓘ 按钮）聚焦时事件从它冒到宿主，宿主一并跟随
      onFocus={showAtHost}
      onBlur={() => setPos(null)}
      onClick={click ? onClick : undefined}
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
