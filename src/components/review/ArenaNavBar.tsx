import type { CSSProperties } from 'react'
import Icon from '../icons'
import SquareButton from '../ui/SquareButton'

// 导航按钮（与 word/WorkbenchNavBar.tsx 的 navBtn 同形）：28×28、无边框无底色，hover 才起底色
const navBtn = (disabled: boolean): CSSProperties => ({
  width: '28px', height: '28px', flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', background: 'transparent', borderRadius: 'var(--radius-md)',
  cursor: disabled ? 'default' : 'pointer',
  color: 'var(--color-text-secondary)',
  opacity: disabled ? 0.3 : 1,
  transition: 'background-color var(--duration-fast) var(--ease-smooth), color var(--duration-fast) var(--ease-smooth)',
})

/**
 * 答题态导航条（v0.6.1 §3.7）。
 *
 * 箭头接会话队列的题号，**不接 navHistoryStore**——这是「题库内的题号移动」，
 * 不是浏览轨迹，与工作台的词条导航条语义不同。
 */
export default function ArenaNavBar({ index, total, canBack, canForward, onBack, onForward, onEnd }: {
  index: number
  total: number
  canBack: boolean
  canForward: boolean
  onBack: () => void
  onForward: () => void
  onEnd: () => void
}) {
  const hoverOn = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.currentTarget.disabled) return
    e.currentTarget.style.background = 'var(--color-surface-hover)'
    e.currentTarget.style.color = 'var(--color-text-primary)'
  }
  const hoverOff = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'transparent'
    e.currentTarget.style.color = 'var(--color-text-secondary)'
  }
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 'var(--z-sticky)',
      display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap',
      background: 'var(--color-canvas)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)', padding: '6px 8px', marginBottom: '14px',
    }}>
      <button type="button" title="上一题" aria-label="上一题" disabled={!canBack}
        onClick={onBack} onMouseEnter={hoverOn} onMouseLeave={hoverOff} style={navBtn(!canBack)}>
        <Icon name="arrow-left" size={15} />
      </button>
      <button type="button" title="下一题" aria-label="下一题" disabled={!canForward}
        onClick={onForward} onMouseEnter={hoverOn} onMouseLeave={hoverOff} style={navBtn(!canForward)}>
        <Icon name="arrow-right" size={15} />
      </button>
      <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginLeft: 4 }}>第 {index + 1} / {total} 题</span>
      <span style={{ flex: 1 }} />
      {/* tone='canvas'（v0.6.2 条目 1）：整条导航条自带 --color-canvas 底（上方第 43 行），
          故脚下说了算——外面那块纯白内容区不参与判断。外层 <main> 虽是 surface，跨过它取。 */}
      <SquareButton size="nav" tone="canvas" onClick={onEnd}>结束回合</SquareButton>
    </div>
  )
}
