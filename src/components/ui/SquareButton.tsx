import { useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

// 方块按钮统一样式（v0.5.3 §4.1 第 16 条重做；配色在 v0.6.1 收尾后按用户选定换过一轮）。
// 配色全部收进项目既有色板：默认态用暖中性底的深一阶，编者模式的生效态用品牌蓝的浅一阶；
// hover 一律「再提亮一档」且不换色相，用 color-mix 现场算——与仓库既有做法一致。
// 换色取值与依据见下方色常量处（含实测对比度）。
// 几何按容器适配而非照搬参考文档的 50px/132px：设置页的开关行高约 30px、导航条内边距 6px，
// 50px 高的按钮会把这两处都撑变形。故只取文档的「圆角方形」观感（方正圆角 + 发丝边），
// 高度与最小宽由 size 决定。字号同理：导航条里与 28×28 的箭头按钮同排，不能压过箭头。
// 过渡白名单只有 transform 与 background-color：按压回弹走 transform、状态换色走底色，
// 不动画 box-shadow / width / 边距。box-shadow 仅用于非动画的静态内描边。
// 圆角 6px：参考文档给的是 14px（圆润方形），但按钮实际只有 34px 高（导航条内更矮），
// 14px 圆角占高度近四成，轮廓读作「胶囊/圆」而非「圆角方形」。6px 保留一点柔度同时
// 保持方正感，也是项目上一版按钮用过的值。
const BUTTON_RADIUS = 6
const BUTTON_TRANSITION = 'transform 150ms cubic-bezier(.25,.1,.25,1), background-color 150ms cubic-bezier(.25,.1,.25,1)'

// ── 配色（四值，全部由既有色板派生，不新增 token）─────────────────────────────
// 静止两态：默认＝暖中性阶梯里比画布明显深的一阶；生效＝品牌蓝的浅一阶。
// hover 一律「同色相再提亮一档」：默认态由 border 提到 sunken，生效态由 78% 品牌提到 72%。
// 阶梯参考（L*）：#FFFFFF 100 → 画布 #F6F4EF 96.2 → #EFECE5 93.4 → #E8E4DE 90.7
//   → #D9D4CE 85.4。色板本身的节奏约 3 L*，故 hover 的阶差取 2 L* 以上才读得出来
//   （旧值 88%+white 只有 0.7 L*，肉眼几乎无变化）。
//
// 生效态之所以取「浅一阶」而不是原来的 --color-brand 实底：按钮的字色是基础字色
// --color-text-primary #1C1814，压在 #4A6FA5（L* 46.4）上只有 3.45:1，低于 AA 4.5，
// 视觉上读作「深字糊在深蓝里」。提到 78%（L* 58.7）后为 5.33:1，跨过 AA；再浅则蓝味
// 开始散掉，故停在 78%。
const NEUTRAL_REST = 'color-mix(in srgb, var(--color-border-strong) 60%, var(--color-surface-sunken))'  // #E2DED7
const NEUTRAL_HOVER = 'var(--color-border)'                                                            // #E8E4DE
const BRAND_ACTIVE = 'color-mix(in srgb, var(--color-brand) 78%, white)'                               // #728FB9
const BRAND_ACTIVE_HOVER = 'color-mix(in srgb, var(--color-brand) 72%, white)'                          // #7D97BE

export const BUTTON_BASE: CSSProperties = {
  minWidth: 88,
  // 竖向 8px → 按钮实测约 31px（8+13+8+2 边框）。6px 时仅 27px，在 30px 高的设置行里偏矮，
  // 重心发飘；31px 与行高相当，不至于把行撑变形。行高由 padding + lineHeight 推出而非写死
  // height，多行标签时按钮仍能随内容长高。
  padding: '8px 12px',
  borderRadius: BUTTON_RADIUS,
  border: '1px solid rgba(0,0,0,.16)',
  // 默认态用主题暖中性底而非强调橙（v0.6.1 §2.1）：暖橙在本仓库有既定语义——个人录入字段
  // （--color-weave-personal）与分类胶囊第 5 色。通用按钮占满默认态会冲淡那层语义。
  // 底色取值见上方 NEUTRAL_REST（暖中性阶梯的深一阶，比画布明显深，按钮立得住）。
  background: NEUTRAL_REST,
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

/** 导航条内的紧凑尺寸：不撑高导航条、不与同排 28×28 的箭头按钮争视觉重量 */
export const BUTTON_SIZE_NAV: CSSProperties = { minWidth: 0, padding: '4px 12px' }

/** 文字行内的紧凑尺寸：跟在标签文字后面（如「本地数据存储位置 浏览」），不限最小宽。
    竖向内边距取 6px 而非 4px：该行不是 30px 的紧凑开关行（那是 DictRow），普通 div 容得下，
    按钮与基底等高才不会在同一行里显得小一号。 */
export const BUTTON_SIZE_ROW: CSSProperties = { minWidth: 0, padding: '6px 12px' }

/** 禁用态：灰底 + 半透明，与项目内既有 disabled 观感一致 */
export const BUTTON_DISABLED: CSSProperties = {
  background: 'var(--color-border-strong)',
  color: 'var(--color-text-tertiary)',
  cursor: 'default',
  opacity: 0.55,
}

export type ButtonSize = 'default' | 'nav' | 'row'

interface Props {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
  /** 编者模式类的形态开关：true 时底色转为品牌蓝的浅一阶（BRAND_ACTIVE）。语义由调用方通过 role/aria-checked 承载 */
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
        ...(size === 'row' ? BUTTON_SIZE_ROW : null),
        ...(disabled ? BUTTON_DISABLED : null),
        // 底色只求值一次：生效态优先于 hover，二者正交时走「生效色的亮一阶」。
        // 写成三段条件展开会互相覆盖（后展开的赢），所以在这里合成单值。
        ...(!disabled ? { background: on ? (hover ? BRAND_ACTIVE_HOVER : BRAND_ACTIVE) : (hover ? NEUTRAL_HOVER : NEUTRAL_REST) } : null),
        ...(pressing && !disabled ? { transform: 'scale(.96)' } : null),
      }}
    >
      {children}
    </button>
  )
}
