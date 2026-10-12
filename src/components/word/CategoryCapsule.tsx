import type { Category } from '../../types/category'

interface Props {
  category: Category
  isSelected?: boolean
  onClick?: () => void
}

function hexToRgb(hex: string): string {
  const m = hex.replace('#', '')
  const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16)
  return `${r}, ${g}, ${b}`
}

export default function CategoryCapsule({ category, isSelected = false, onClick }: Props) {
  const rgb = hexToRgb(category.color)
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
        background: isSelected ? category.color : `rgba(${rgb}, 0.12)`,
        color: isSelected ? '#FFFFFF' : category.color,
        transition: 'background-color var(--duration-fast) var(--ease-smooth), color var(--duration-fast) var(--ease-smooth)',
      }}
      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = `rgba(${rgb}, 0.18)` }}
      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = `rgba(${rgb}, 0.12)` }}
    >
      <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: isSelected ? '#FFFFFF' : category.color }} />
      {category.name}
    </span>
  )
}
