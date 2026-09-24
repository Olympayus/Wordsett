import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

// 方块按钮统一样式（v0.5.3 §4.1 第 16 条重做）。
// 配色收进项目既有色板：默认态用暖橙 --color-accent（与词条卡片的强调色同源），
// 编者模式的生效态用 --color-brand。hover 亮一阶不新增 token，用 color-mix 现场提亮
// ——与仓库既有做法一致（color-mix 在 src/ 已有 8 处）。
// 几何按容器适配而非照搬参考文档的 50px/132px：设置页的开关行高约 30px、导航条内边距 6px，
// 50px 高的按钮会把这两处都撑变形。故只取文档的「圆润方形」观感（14px 圆角 + 发丝边），
// 高度与最小宽由 size 决定。字号同理：导航条里与 28×28 的箭头按钮同排，不能压过箭头。
// 过渡白名单只有 transform 与 background-color：按压回弹走 transform、状态换色走底色，
// 不动画 box-shadow / width / 边距。box-shadow 仅用于非动画的静态内描边。
const BUTTON_RADIUS = 14
const BUTTON_TRANSITION = 'transform 150ms cubic-bezier(.25,.1,.25,1), background-color 150ms cubic-bezier(.25,.1,.25,1)'

export const BUTTON_BASE: CSSProperties = {
  minWidth: 88,
  padding: '6px 16px',
  borderRadius: BUTTON_RADIUS,
  border: '1px solid rgba(0,0,0,.16)',
  background: 'var(--color-accent)',
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: '-0.01em',
  lineHeight: 1,
  cursor: 'pointer',
  transition: BUTTON_TRANSITION,
  // 触屏与桌面混合：禁掉双击缩放选中与移动端点击高亮块，否则按下时会闪一块系统色
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
  userSelect: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  flexShrink: 0,
  whiteSpace: 'nowrap',
}

// hover 亮一阶：与默认色同色相，只提亮，不换色相——与参考文档「同色相亮一阶」一致
const ACCENT_HOVER = 'color-mix(in srgb, var(--color-accent) 88%, white)'
const BRAND_HOVER = 'color-mix(in srgb, var(--color-brand) 88%, white)'

/** 导航条内的紧凑尺寸：不撑高导航条、不与同排 28×28 的箭头按钮争视觉重量 */
export const BUTTON_SIZE_NAV: CSSProperties = { minWidth: 0, padding: '4px 12px' }

/** 禁用态：灰底 + 半透明，与项目内既有 disabled 观感一致 */
export const BUTTON_DISABLED: CSSProperties = {
  background: 'var(--color-border-strong)',
  color: 'var(--color-text-tertiary)',
  cursor: 'default',
  opacity: 0.55,
}

export type ButtonSize = 'default' | 'nav'

interface Props {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
  /** 编者模式类的形态开关：true 时底色转为品牌蓝。语义由调用方通过 role/aria-checked 承载 */
  pressed?: boolean
  size?: ButtonSize
  /** 透传语义属性：形态开关需要 role="switch" + aria-checked，普通瞬时按钮不需要 */
  role?: 'switch' | 'button'
  'aria-checked'?: boolean
  'aria-label'?: string
}

export default function SquareButton({ children, onClick, disabled, title, pressed, size = 'default', role, 'aria-checked': ariaChecked, 'aria-label': ariaLabel }: Props) {
  // hover / 按压必须用 JS 模拟：项目视觉一律走内联 style，不引 CSS class（见文件头注释）。
  // 按压用三事件配对而非 click —— 指针在按钮上松开才算有效，避免按下后滑出仍触发视觉反馈。
  const [hover, setHover] = useState(false)
  const [pressing, setPressing] = useState(false)
  const on = Boolean(pressed)
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      role={role}
      aria-checked={ariaChecked}
      aria-label={ariaLabel}
      onClick={onClick}
      onPointerDown={() => { if (!disabled) setPressing(true) }}
      onPointerUp={() => setPressing(false)}
      onPointerLeave={() => { setPressing(false); setHover(false) }}
      onMouseEnter={() => { if (!disabled) setHover(true) }}
      onMouseLeave={() => { setHover(false); setPressing(false) }}
      style={{
        ...BUTTON_BASE,
        ...(size === 'nav' ? BUTTON_SIZE_NAV : null),
        ...(disabled ? BUTTON_DISABLED : null),
        // 底色只求值一次：生效态优先于 hover，二者正交时走「生效色的亮一阶」。
        // 写成三段条件展开会互相覆盖（后展开的赢），所以在这里合成单值。
        ...(!disabled ? { background: on ? (hover ? BRAND_HOVER : 'var(--color-brand)') : (hover ? ACCENT_HOVER : 'var(--color-accent)') } : null),
        ...(pressing && !disabled ? { transform: 'scale(.96)' } : null),
      }}
    >
      {children}
    </button>
  )
}
