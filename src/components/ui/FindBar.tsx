import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// 统一页内查找（spec §4b）：挂 AppShell，工作台与词典详情共用；CSS Custom Highlight API 高亮
// CSS Custom Highlight API 由 lib.dom（TS ≥6）/ WebView2 提供，无需 shim 文件
const HIGHLIGHT_NAME = 'wordsett-find'
let current: FindBarController | null = null   // 单实例

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

export default function FindBar() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [matches, setMatches] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { current = new FindBarController(() => { setQuery(q => q || ''); setOpen(true); requestAnimationFrame(() => inputRef.current?.focus()) }); return () => { current = null } }, [])

  useEffect(() => {
    // 命中节点高亮 + 索引导航（计数器与高亮同源：均遍历 <main> 的文本节点）
    if (!open || !query.trim()) { CSS.highlights?.delete(HIGHLIGHT_NAME); setMatches(0); return }
    if (typeof Highlight === 'undefined' || !CSS.highlights) { setMatches(0); return }
    const hl = new Highlight()
    const walker = document.createTreeWalker(document.querySelector('main') ?? document.body, NodeFilter.SHOW_TEXT)
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
  }, [open, query, index])

  if (!open) return null
  return createPortal(
    <div style={{
      position: 'fixed', top: 8, right: 8, zIndex: 5000, display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 10px', background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-overlay)',
    }}>
      <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setIndex(0) }}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}
        placeholder="在页面内查找…" autoFocus
        style={{ width: 200, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--color-text-primary)' }} />
      <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{Math.min(index + 1, matches)}/{matches}</span>
      <button type="button" onClick={() => matches > 0 && setIndex(i => Math.min(i + 1, matches - 1))} style={btnStyle}>↓</button>
      <button type="button" onClick={() => setIndex(i => Math.max(i - 1, 0))} style={btnStyle}>↑</button>
      <button type="button" onClick={() => setOpen(false)} style={btnStyle}>×</button>
    </div>,
    document.body
  )
}
const btnStyle = { border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 14, padding: '2px 6px', borderRadius: 4 }
