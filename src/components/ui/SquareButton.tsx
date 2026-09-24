import type { CSSProperties, ReactNode } from 'react'

// 方块按钮统一样式（v0.5.3 §4.1 第 16 条）：更深品牌色底 + 通用黑色无衬线体、不加粗。
// 用于设置页的「新建分类」「导入/导出备份文件」「检查更新」「浏览」。
// 注意：tokens.css 只有 --color-brand (#4A6FA5) 与两个更浅的品牌色，没有更深的品牌色变量，
// 故用 color-mix 现场加深，不新增 token（避免为单点用途扩 tokens）。
// 同时导出，供需要自行叠加状态样式的调用方（如 WorkbenchNavBar）复用同一份底样。
export const SQUARE_BUTTON_STYLE: CSSProperties = {
  padding: '5px 14px',
  borderRadius: 6,
  border: 'none',
  background: 'color-mix(in srgb, var(--color-brand) 82%, black)',
  color: 'black',
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  fontWeight: 'normal',
  cursor: 'pointer',
}

interface Props {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
}

export default function SquareButton({ children, onClick, disabled, title }: Props) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{ ...SQUARE_BUTTON_STYLE, ...(disabled ? { opacity: 0.5, cursor: 'default', background: 'var(--color-border-strong)' } : {}) }}
    >
      {children}
    </button>
  )
}
