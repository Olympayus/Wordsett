import { useState } from 'react'

/**
 * 通用勾选框（v0.6.3 条目 14，形制 A′）。
 *
 * 16×16 圆角方块 + 描边；**选中态是填入的色块，不画白对勾**。
 * 内块 10px（占外框 62.5%）、四周留 3px 留白。下面的表**统一按 16px 外框**对照：
 * 圆点式那一档换算自已排除的 22px 档（内块 8.8 / 留白 6.6，即 40% 内块）。
 *
 *   | 形态              | 内块     | 留白   |
 *   |------------------|----------|--------|
 *   | 满填（极端值）     | 铺满内缘  | 0      |
 *   | **A′（本组件）**   | 10px     | 3px    |
 *   | 圆点式（已排除）   | 6.4px    | 4.8px  |
 *
 * 三档里真正被约束的是**留白必须是整数**：小数留白会让内块在非整数 DPI 下四边取整
 * 不一致，看上去就是「色块没居中」，圆点式的 4.8 正是本档排除掉它的原因之一。
 * 描边与外框圆角则**刻意不跟内块缩**，见几何常量处的注释。
 *
 * a11y 取舍（改这个组件前先读）：去掉对勾后，选中与否只由「有无色块 + 描边颜色」表达。
 * 这不是纯色相差（还含面积与明度），对色觉障碍可读；但 aria-checked 必须正确，
 * 否则读屏用户拿不到状态。故本组件渲染 role="checkbox"，而不是套一个原生 input 再藏起来。
 *
 * `color` 默认为品牌蓝；分类强化行传分类色——那是唯一按分类走色的调用点。
 */

/** 描边与内块的颜色（v0.6.3 条目 14）。抽成纯函数让「悬停不预演填入」这条规则可测。
 *  禁用态返回 fill: null：整体降透明度由组件负责，内块不再单独表达。 */
export function checkboxAppearance({ checked, hover, disabled, color }: {
  checked: boolean; hover: boolean; disabled?: boolean; color: string
}): { border: string; fill: string | null } {
  if (disabled) return { border: checked ? color : 'var(--color-border-strong)', fill: null }
  if (checked) return { border: color, fill: color }
  return { border: hover ? 'var(--color-text-tertiary)' : 'var(--color-border-strong)', fill: null }
}

/**
 * 几何常量（v0.6.5：18×18 → 16×16）。
 *
 * 内块 10px，四周留 3px——留白必须是**整数**：v0.6.4 的 18/12 看着也是 3px 整数，但描边
 * 是真 border，Tailwind preflight 又是 border-box，内容盒被压成 15px，内块于是坐在
 * 1.5px 的小数内缩上，非整数 DPI 下四边取整不一致，看上去就是「色块没居中」。
 * 现在描边换成 inset 盒内阴影（不占空间），居中发生在外框 16px 这个整数尺寸上。
 * 内块圆角 2，与原先 22px 一档的 2 同值。
 *
 * **描边与外框圆角不缩**：等比会得到 1.23px / 3.27px 两个非整数魔法数，且 1.23px 在
 * 非整数 DPI 下会渲染成半像素发虚。1.5px 是本仓既有的强调描边档（词性 pill 同款），
 * 圆角保留 --radius-sm token。代价是「描边:边长」升到 9.4%，视觉上略重一点。
 *
 * 抽成常量是为了可测：node 环境下断言不到 DOM，只能钉常量契约。
 */
export const CHECKBOX_SIZE = 16
export const CHECKBOX_INNER = 10
export const CHECKBOX_INNER_RADIUS = 2

export default function CheckBox({ checked, onChange, disabled, color, label }: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  /** 描边与内块的颜色，默认品牌蓝 */
  color?: string
  /** 无障碍名。本组件不渲染可见文字，故必填 */
  label: string
}) {
  const [hover, setHover] = useState(false)
  const c = color ?? 'var(--color-brand)'
  const { border, fill } = checkboxAppearance({ checked, hover, disabled, color: c })
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => { if (!disabled) onChange(!checked) }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: CHECKBOX_SIZE, height: CHECKBOX_SIZE, flexShrink: 0, padding: 0, cursor: disabled ? 'default' : 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)',
        // 描边用盒内阴影而不是真 border：真 border 会占掉盒内空间（Tailwind preflight 是
        // border-box），留白于是算在一个被压过的内容盒上。inset 阴影不占空间，
        // 居中发生在外框本身这个整数尺寸上——这是 v0.6.4 那个「色块没居中」的根治点。
        boxShadow: `inset 0 0 0 1.5px ${border}`,
        opacity: disabled ? 0.38 : 1,
        transition: 'box-shadow var(--duration-fast) var(--ease-smooth)',
      }}
    >
      {fill && <span style={{ width: CHECKBOX_INNER, height: CHECKBOX_INNER, borderRadius: CHECKBOX_INNER_RADIUS, background: fill, display: 'block' }} />}
    </button>
  )
}
