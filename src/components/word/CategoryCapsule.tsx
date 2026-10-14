import type { Category } from '../../types/category'

interface Props {
  category: Category
  isSelected?: boolean
  onClick?: () => void
}

export default function CategoryCapsule({ category, isSelected = false, onClick }: Props) {
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
      }}
      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = tint(18) }}
      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = tint(12) }}
    >
      <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: isSelected ? 'var(--color-surface)' : category.color }} />
      {category.name}
    </span>
  )
}
