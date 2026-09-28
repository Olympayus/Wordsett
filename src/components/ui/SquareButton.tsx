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

// ── 配色（v0.6.2 条目 1：按按钮的**直接父级背景**分两套）────────────────────────
// 画布套＝v0.6.1 的现状值；白底套整体浅一阶——同样的按钮压在纯白上会显得更重，
// 与画布的对比也过强。两套都不用新 token，全部由既有色板派生。
//
// 阶梯参考（L*）：#FFFFFF 100 → 画布 #F6F4EF 96.2 → 白底套 rest #E8E4DE 90.7
//   → 白底套 hover #EFECE5 93.4；画布套 rest #E2DED7 88.6 → hover #E8E4DE 90.7。
// 两套的 hover 阶差都在 2 L* 以上（v0.6.1 定下的可读门槛）。
// NEUTRAL_HOVER_CANVAS 与 NEUTRAL_REST_SURFACE 是**同一档**（--color-border），
// 这是两套阶梯各自右移一阶的必然结果，不是笔误。改动其一必须同时改另一处，
// 否则 hover 的阶差会塌掉：但 BUTTON_TONES 的形状把两套摆成了彼此独立，
// 只调一档不会报错、只会悄悄破坏这个对应关系。
const NEUTRAL_REST_CANVAS = 'color-mix(in srgb, var(--color-border-strong) 60%, var(--color-surface-sunken))'  // #E2DED7
const NEUTRAL_HOVER_CANVAS = 'var(--color-border)'                                                             // #E8E4DE
const NEUTRAL_REST_SURFACE = 'var(--color-border)'                                                             // #E8E4DE
const NEUTRAL_HOVER_SURFACE = 'var(--color-surface-sunken)'                                                     // #EFECE5

// 生效态（编者模式类的形态开关）：品牌蓝的浅一阶，两套共用——形态开关的语义由
// role/aria-checked 承载，底色只需与常态可区分，不随容器底变浅。
//
// 之所以取「浅一阶」而不是原来的 --color-brand 实底：按钮的字色是基础字色
// --color-text-primary #1C1814，压在 #4A6FA5（L* 46.4）上只有 3.45:1，低于 AA 4.5，
// 视觉上读作「深字糊在深蓝里」。提到 78%（L* 58.7）后为 5.33:1，跨过 AA；再浅则蓝味
// 开始散掉，故停在 78%。
const BRAND_ACTIVE = 'color-mix(in srgb, var(--color-brand) 78%, white)'                               // #728FB9
const BRAND_ACTIVE_HOVER = 'color-mix(in srgb, var(--color-brand) 72%, white)'                          // #7D97BE

/** 两套底色（测试与调用点核对用；渲染仍走组件内部的 tone 分支）。 */
export const BUTTON_TONES = {
  canvas: { rest: NEUTRAL_REST_CANVAS, hover: NEUTRAL_HOVER_CANVAS },
  surface: { rest: NEUTRAL_REST_SURFACE, hover: NEUTRAL_HOVER_SURFACE },
} as const

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
  // 底色取值见上方 NEUTRAL_REST_CANVAS（暖中性阶梯的深一阶，比画布明显深，按钮立得住）。
  // 这是缺省 canvas 套的值；tone='surface' 的调用点由下方 tone 分支覆盖成浅一阶。
  background: NEUTRAL_REST_CANVAS,
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

/** 按钮底色的两套取值：画布套 / 白底套。判据见 `Props.tone` 的注释。 */
export type ButtonTone = 'canvas' | 'surface'

/**
 * 底色选择（v0.6.2 条目 1）。抽成纯函数是为了让「哪套底色 + 哪个态」这条规则
 * 只有一份实现、且能被测试直接驱动——否则测试只能验常量，改接线它照样全绿。
 * 组件与测试共用这一处，故组件里的 tone 分支不存在第二份。
 *
 * 返回 `null` 表示「不设 background」，让按钮回落到 BUTTON_BASE / BUTTON_DISABLED
 * 各自的底色（禁用态因此不参与 tone 分选，与 v0.6.1 的行为一致）。
 *
 * 规则：生效态（on）优先于 hover——形态开关开到 hover 上时走生效色的亮一阶，
 * 而不是掉回中性底。
 */
export function buttonBackground({ disabled, on, hover, tone }: { disabled?: boolean; on?: boolean; hover: boolean; tone?: ButtonTone }): string | null {
  if (disabled) return null
  if (on) return hover ? BRAND_ACTIVE_HOVER : BRAND_ACTIVE
  return tone === 'surface'
    ? (hover ? NEUTRAL_HOVER_SURFACE : NEUTRAL_REST_SURFACE)
    : (hover ? NEUTRAL_HOVER_CANVAS : NEUTRAL_REST_CANVAS)
}

interface Props {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
  /** 编者模式类的形态开关：true 时底色转为品牌蓝的浅一阶（BRAND_ACTIVE）。语义由调用方通过 role/aria-checked 承载 */
  pressed?: boolean
  size?: ButtonSize
  /**
   * 底色变体（v0.6.2 条目 1）。判据是**按钮的直接父级背景**，不是更外层。
   *
   * 规则一句话：`surface` 只表示「我的直接父级就是 `--color-surface`」，
   * 其余一律 `canvas`。项目里容器底有五六个 token 而变体只有两个，
   * 所以只要父级不是纯白，就走 `canvas`（画布套压在任何较深／带色的底上都还读得出来，
   * 白底套压在非纯白底上则可能与容器糊在一起）。
   *
   * 反例，别照着外层背景标：`ArenaNavBar` 整个浮在复习区右侧那块**纯白**内容区之上，
   * 但它自身带 `background: var(--color-canvas)`（`ArenaNavBar.tsx:43`），
   * 所以它里面的按钮是 `canvas` 而不是 `surface`——外面是白的，脚下是画布，脚下说了算。
   *
   * 缺省 `canvas`＝v0.6.1 的现状行为，调用点可逐个迁移。
   */
  tone?: ButtonTone
  /**
   * 单键的最小宽（px），覆盖 BUTTON_BASE 的 88。
   * BUTTON_BASE 的 `minWidth: 88` 与 `flexShrink: 0` 是为「按内容宽、不被压扁」定的，
   * 而 88 对「忘了 1」这类两字标签偏宽；三级评分键要的就是更窄的一档（RatingBar 传 68）。
   * 做成具名 prop 而不是给调用方开 style 透传：按钮的横向几何只有这一处说了算。
   * 与已废弃的 `grow` 相反——grow 改的是**上限**（等分擑满整行），这个改的是**下限**。
   */
  minWidth?: number
  /** 快捷键提示（三级评分键的 1 / 2 / 3）。读屏会念出来 */
  'aria-keyshortcuts'?: string
  /** 透传语义属性：形态开关需要 role="switch" + aria-checked，普通瞬时按钮不需要 */
  role?: 'switch' | 'button'
  'aria-checked'?: boolean
  'aria-label'?: string
}

export default function SquareButton({ children, onClick, disabled, title, pressed, size = 'default', tone = 'canvas', minWidth, role, 'aria-checked': ariaChecked, 'aria-label': ariaLabel, 'aria-keyshortcuts': ariaKeyshortcuts }: Props) {
  // hover / 按压必须用 JS 模拟：项目视觉一律走内联 style，不引 CSS class（见文件头注释）。
  // 按压用三事件配对而非 click —— 指针在按钮上松开才算有效，避免按下后滑出仍触发视觉反馈。
  const [hover, setHover] = useState(false)
  const [pressing, setPressing] = useState(false)
  const on = Boolean(pressed)
  // 底色规则在 buttonBackground 里（含「为什么合成单值」）；此处只消费它的结果。
  const background = buttonBackground({ disabled, on, hover, tone })
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      role={role}
      aria-checked={ariaChecked}
      aria-label={ariaLabel}
      aria-keyshortcuts={ariaKeyshortcuts}
      onClick={onClick}
      onPointerDown={() => { if (!disabled) setPressing(true) }}
      onPointerUp={() => setPressing(false)}
      onPointerLeave={() => { setPressing(false); setHover(false) }}
      onMouseEnter={() => { if (!disabled) setHover(true) }}
      onMouseLeave={() => { setHover(false); setPressing(false) }}
      style={{
        ...BUTTON_BASE,
        ...(minWidth !== undefined ? { minWidth } : null),
        // size='row' 是 BUTTON_SIZE_ROW（minWidth: 0）；调用方显式给的 minWidth 排在它之后，
        // 故 size 与 minWidth 同时出现时以 minWidth 为准——两个都叫「最窄多宽」，
        // 顺序必须写死，否则谁生效全靠声明顺序。
        ...(size === 'nav' ? BUTTON_SIZE_NAV : null),
        ...(size === 'row' ? BUTTON_SIZE_ROW : null),
        ...(disabled ? BUTTON_DISABLED : null),
        ...(background !== null ? { background } : null),
        ...(pressing && !disabled ? { transform: 'scale(.96)' } : null),
      }}
    >
      {children}
    </button>
  )
}
