import { useState } from 'react'

/**
 * 通用勾选框（v0.6.3 条目 14，形制 A′）。
 *
 * 22×22 圆角方块 + 描边；**选中态是填入的色块，不画白对勾**。
 * 内块 15px（约占 68%）、四周留 3.5px 留白——留白比例是唯一可调的档，对照基准：
 *
 *   | 形态              | 内块     | 留白   |
 *   |------------------|----------|--------|
 *   | 满填（极端值）     | 铺满内缘  | 0      |
 *   | **A′（本组件）**   | 15px     | 3.5px  |
 *   | 圆点式（已排除）   | 8.8px    | 6.6px  |
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
        width: 22, height: 22, flexShrink: 0, padding: 0, cursor: disabled ? 'default' : 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)',
        border: `1.5px solid ${border}`,
        opacity: disabled ? 0.38 : 1,
        transition: 'border-color var(--duration-fast) var(--ease-smooth)',
      }}
    >
      {fill && <span style={{ width: 15, height: 15, borderRadius: 3, background: fill, display: 'block' }} />}
    </button>
  )
}
