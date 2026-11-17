import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useViewStore } from '../../stores/viewStore'
import { useMobilePopup } from '../../lib/mobilePopups'
import { scaleForAnchor, type OverlayScale } from '../../lib/overlayZoom'
import { touchInputStyles } from '../../lib/touchInput'
import ClearButton from './ClearButton'

// 统一页内查找（spec §4b）：挂 AppShell，工作台与词典详情共用；CSS Custom Highlight API 高亮
// CSS Custom Highlight API 由 lib.dom（TS ≥6）/ WebView2 提供，无需 shim 文件
const HIGHLIGHT_NAME = 'wordsett-find'
let current: FindBarController | null = null   // 单实例

/**
 * 打开页内查找（v0.7.10 Task 27）：手机 ⋯ 菜单 / 平板导航条的入口调它（Task 28 接线）。
 * 无实例时空操作——两个外壳同一时刻只挂一份 `FindBar`，离开词条页即无实例。
 */
export function openFind(): void {
  current?.open()
}

export function registerFindKeyHandler() {
  const handler = (e: KeyboardEvent) => { if (e.ctrlKey && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); current?.open() } }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}

class FindBarController {
  private openState: () => void
  constructor(openState: () => void) { this.openState = openState }
  open() { this.openState() }
}

export default function FindBar({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [matches, setMatches] = useState(0)
  const activeModule = useViewStore(s => s.activeModule)
  const inputRef = useRef<HTMLInputElement>(null)
  // 桌面 / 平板形态的缩放锚点（v0.7.10 §7.5 / §7.8）：本组件挂在 `AppShell` 的子树里，
  // 平板的 `zoom` 宿主是它的祖先；portal 到 body 的面板不再被祖先缩放，需按 zoom 补 transform。
  // 隐藏宿主 span 只为提供「祖先是谁」——它属于 AppShell 树、零布局，桌面看不出任何变化。
  const hostRef = useRef<HTMLSpanElement>(null)
  const [scale, setScale] = useState<OverlayScale | null>(null)
  useEffect(() => { current = new FindBarController(() => { setQuery(q => q || ''); setOpen(true); requestAnimationFrame(() => inputRef.current?.focus()) }); return () => { current = null } }, [])
  // 打开期间登记进手机返回栈（v0.7.10 Task 27）：安卓返回键先关查找条，不穿透到抽屉 / 模块。
  // 桌面外壳不读这张表，登记本身无副作用。
  useMobilePopup(open, () => setOpen(false))

  useEffect(() => {
    // 命中节点高亮 + 索引导航（计数器与高亮同源：均遍历 <main> 的文本节点）
    if (!open || !query.trim()) { CSS.highlights?.delete(HIGHLIGHT_NAME); setMatches(0); return }
    if (typeof Highlight === 'undefined' || !CSS.highlights) { setMatches(0); return }
    const hl = new Highlight()
    // 搜索根绑定当前激活模块（v0.5.2 §4b）：工作台隐藏时其 <main> 仍在 DOM 中，
    // 按 activeModule 选取 data-find-root 对应的内容根，避免在设置页里搜到隐藏的工作台文本。
    const root = document.querySelector(`[data-find-root="${activeModule}"]`) ?? document.body
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const ranges: Range[] = []
    let target: Range | null = null
    let node: Node | null
    const q = query.trim().toLowerCase()
    let n = 0
    while ((node = walker.nextNode())) {
      const text = node.textContent ?? ''
      const lower = text.toLowerCase()
      let i = lower.indexOf(q)
      while (i !== -1) {
        const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + q.length); ranges.push(r)
        if (n === index) target = r
        n++
        i = lower.indexOf(q, i + q.length)
      }
    }
    setMatches(n)
    ranges.forEach(r => hl.add(r))
    CSS.highlights?.set(HIGHLIGHT_NAME, hl)
    if (target) { const el = target.startContainer.parentElement; el?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }
  }, [open, query, index, activeModule])

  // 平板 zoom 补偿（v0.7.10 §7.5 / §7.8）：与 Tooltip / ContextMenu 同一口径——
  // 先于绘制读出宿主祖先的 zoom，面板按 scale(zoom) 缩回视觉尺寸。桌面 zoom = 1 → null，
  // 不写 transform，样式逐字不变。手机形态流内渲染、不受 zoom 影响，不参与。
  useLayoutEffect(() => {
    if (!open || variant === 'mobile') { setScale(null); return }
    setScale(scaleForAnchor(hostRef.current))
  }, [open, variant])

  if (!open) {
    // 桌面 / 平板形态需要一个属于 `AppShell` 子树的锚点来读 zoom；关闭时只留这个
    // 零布局的隐藏 span，面板本身仍不渲染。手机形态不需要它，保持原样返回 null。
    return variant === 'mobile' ? null : <span ref={hostRef} style={{ display: 'none' }} />
  }
  if (variant === 'mobile') {
    // 手机形态（v0.7.10 Task 27）：流内整条、贴在 `MobileAppBar` 正下方（顶栏 52 + 安全区已由
    // 顶栏自己承担），不 portal、不做坐标计算，打开时把内容区往下推而不是盖住它。
    // 几何：条高 52（与顶栏同档）、输入 16px / 40px（`touchInputStyles`，iOS 聚焦不缩放）、
    // ↑↓ / 关闭各 44dp；打开即弹键盘沿用 controller 的 rAF focus + `autoFocus`。
    return (
      <div style={mobileBarStyle}>
        <div style={mobileInputShellStyle}>
          <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setIndex(0) }}
            onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
            placeholder="在页面内查找…" autoFocus
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
              color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)',
              ...touchInputStyles(true), padding: 0 }} />
          <ClearButton visible={query.length > 0} onClick={() => { setQuery(''); setIndex(0); inputRef.current?.focus() }} />
        </div>
        <span style={{ flex: 'none', fontSize: 12, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
          {Math.min(index + 1, matches)}/{matches}
        </span>
        {/* 顺序（v0.7.10 §7.8「↑↓」）：手机形态 ↑ 在前、↓ 在后；桌面形态保持原样。 */}
        <button type="button" aria-label="上一个匹配" onClick={() => setIndex(i => Math.max(i - 1, 0))} style={mobileBtnStyle}>↑</button>
        <button type="button" aria-label="下一个匹配" onClick={() => matches > 0 && setIndex(i => Math.min(i + 1, matches - 1))} style={mobileBtnStyle}>↓</button>
        <button type="button" aria-label="关闭查找" onClick={() => setOpen(false)} style={mobileBtnStyle}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
          </svg>
        </button>
      </div>
    )
  }
  return (
    <>
      <span ref={hostRef} style={{ display: 'none' }} />
      {createPortal(
        <div style={{
          // 置于内容区右上角（header 高 48，避开右上角窗口控制），右对齐贴合内容区与右边距
          position: 'fixed', top: 56, right: 12, zIndex: 5000, display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 10px', background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-overlay)',
          // 平板 zoom（v0.7.10 §7.5 / §7.8）：从右上角缩，右缘与上缘的落点保持不动。
          ...(scale ? { transform: scale.transform, transformOrigin: 'top right' } : null),
        }}>
          <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setIndex(0) }}
            onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
            placeholder="在页面内查找…" autoFocus
            style={{ width: 150, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--color-text-primary)' }} />
          <ClearButton visible={query.length > 0} onClick={() => { setQuery(''); setIndex(0); inputRef.current?.focus() }} />
          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{Math.min(index + 1, matches)}/{matches}</span>
          <button type="button" onClick={() => matches > 0 && setIndex(i => Math.min(i + 1, matches - 1))} style={btnStyle}>↓</button>
          <button type="button" onClick={() => setIndex(i => Math.max(i - 1, 0))} style={btnStyle}>↑</button>
          <button type="button" aria-label="关闭查找" onClick={() => setOpen(false)} style={btnStyle}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
            </svg>
          </button>
        </div>,
        document.body
      )}
    </>
  )
}
const btnStyle = { border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 14, padding: '2px 6px', borderRadius: 4 }

// 手机形态的几何（v0.7.10 Task 27）：条高与顶栏同档 52，输入胶囊吃掉剩余宽度，
// 三枚按钮各 44dp（触摸命中下限）。颜色只取既有 token。
const mobileBarStyle: CSSProperties = {
  flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4,
  height: 52, padding: '0 8px', boxSizing: 'border-box',
  background: 'var(--color-chrome)', borderBottom: '1px solid var(--color-border)',
}
const mobileInputShellStyle: CSSProperties = {
  flex: '1 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', gap: 8,
  padding: '0 12px', background: 'var(--color-surface)',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-full)',
}
const mobileBtnStyle: CSSProperties = {
  flex: 'none', width: 44, height: 44, padding: 0,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', background: 'transparent', cursor: 'pointer',
  color: 'var(--color-text-secondary)', fontSize: 18, borderRadius: 'var(--radius-md)',
  touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
}
