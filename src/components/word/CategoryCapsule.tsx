import type { Category } from '../../types/category'
import { hitAreaStyle } from '../../lib/mobileHitArea'

interface Props {
  category: Category
  isSelected?: boolean
  onClick?: () => void
  /**
   * v0.7.7 Task 10（spec §3.5）：手机上给 24px 胶囊补一层 44dp 的纵向命中区。
   * 覆盖层绝对定位、不占位、不改变排布；**只纵向扩**——胶囊横向与相邻胶囊只隔 10px，
   * 横向扩会误中邻居。桌面不传，DOM 与样式逐字不变。
   */
  touch?: boolean
}

/** 胶囊视觉高（`h-6`）与命中区高（44dp）；覆盖层以胶囊为基准上下各溢出 `(44-24)/2 = 10`。 */
const CAPSULE_HEIGHT = 24
const HIT_OFFSET_Y = -(44 - CAPSULE_HEIGHT) / 2

export default function CategoryCapsule({ category, isSelected = false, onClick, touch = false }: Props) {
  // 分类色现在是 token 名（var(--color-cat-N)）或 v0.7.2 之前的旧 hex——两者都能直接喂给
  // background / color-mix，故不再手写 hexToRgb 拆色，淡底改用 color-mix 现场算
  // （与仓库既有做法一致，且同时兼容 token 与 hex 两种存量值）。
  const tint = (pct: number) => `color-mix(in srgb, ${category.color} ${pct}%, transparent)`
  const handleKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (!onClick) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() }
  }
  return (
    <span
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : -1}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-xs font-medium cursor-pointer select-none"
      style={{
        background: isSelected ? category.color : tint(12),
        color: isSelected ? 'var(--color-surface)' : category.color,
        transition: 'background-color var(--duration-fast) var(--ease-smooth), color var(--duration-fast) var(--ease-smooth)',
        // 覆盖层以胶囊为定位基准：只在手机加，桌面样式逐字不变。
        ...(touch ? { position: 'relative' as const } : null),
      }}
      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = tint(18) }}
      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = tint(12) }}
    >
      {touch && (
        // 44dp 命中区（v0.7.7 Task 10）：绝对定位、不进布局；挂在胶囊**内部**，点击冒泡回本 span
        // 的 onClick——监听不搬家，也没有第二枚按钮。无 z-index：不盖过按钮自身。
        <span aria-hidden="true" style={{ ...hitAreaStyle({ verticalOnly: true }), top: `${HIT_OFFSET_Y}px` }} />
      )}
      <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: isSelected ? 'var(--color-surface)' : category.color }} />
      {category.name}
    </span>
  )
}
