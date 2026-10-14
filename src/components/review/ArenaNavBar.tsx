import type { CSSProperties } from 'react'
import Icon from '../icons'
import SquareButton from '../ui/SquareButton'
import { NAV_HEIGHT, NAV_CONTROL_HEIGHT } from '../../lib/layout'

// 导航按钮（与 word/WorkbenchNavBar.tsx 的 navBtn 同形）：无边框无底色，hover 才起底色；
// 高取 NAV_CONTROL_HEIGHT，与同排的方块按钮逐像素等高（v0.7.2）
const navBtn = (disabled: boolean): CSSProperties => ({
  width: '28px', height: `${NAV_CONTROL_HEIGHT}px`, flexShrink: 0,
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
      // 通栏细行（v0.7.2）：本身不再 sticky——它与下面的进度条一起被 ReviewModule 的
      // 那个吸顶块包住（两个 sticky 层会互相打架）。无圆角、下缘一道细线，底取内容面。
      minHeight: `${NAV_HEIGHT}px`, display: 'flex', alignItems: 'center', gap: '10px',
      padding: '0 14px',
      background: 'var(--color-surface)',
      borderBottom: '1px solid var(--color-border)',
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
      {/* tone='surface'（v0.7.2）：本条底已由 canvas 改为内容面（--color-surface），按 SquareButton
          的规则（tone 随「直接父级的底」选套，脚下说了算），其内按钮取 surface。 */}
      <SquareButton size="nav" tone="surface" onClick={onEnd}>结束回合</SquareButton>
    </div>
  )
}
