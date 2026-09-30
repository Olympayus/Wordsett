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
 * 三档之间真正被约束的是**留白必须是整数**：小数留白会让内块在非整数 DPI 下四边取整
 * 不一致，看上去就是「色块没居中」——本档的 3px 是这么挑的，圆点式那一档（按 16px
 * 外框换算即 4.8px 小数留白）也正落在这个毛病上（v0.6.3 原始尺寸 22px 时的排除理由
 * 未记录）。描边与外框圆角则**刻意不跟内块缩**，见几何常量处的注释。
 *
 * **内块与描边都是「画」出来的，控件里没有第二个盒子（v0.6.5 修订，本条是根治点）**：
 * 内块曾经是一个 10×10 的 `<span>`，靠 flex 居中——那是**布局盒子**，而 Blink 会把布局
 * 盒子的边按设备像素取整。外框 16px、内块缩进 3px 这两条在 125% / 150% 缩放（Windows
 * 笔记本的默认档）下不是设备像素的整数倍：内块左右两条边的取整各自独立，差 1 个设备像素，
 * 而它两侧的留白只有 1.5px——一个设备像素的误差落在这条缝里就是它的一大半，看上去就是
 * **色块在外框里偏向一侧**。v0.6.4 归因于「真 border 压了内容盒」（那确实也是问题，但只
 * 是其中之一），改成盒内阴影后描边不再占空间，内块这个**布局盒子却原样留着**，所以症状
 * 只是减轻、没有消失。现在内块也走盒内阴影：阴影是抗锯齿**画**出来的路径，不参与布局取整，
 * 与外框描边同源同路径，两者不可能互相错开。
 *
 * a11y 取舍（改这个组件前先读）：去掉对勾后，选中与否只由「有无色块 + 描边颜色」表达。
 * 这不是纯色相相差（还含面积与明度），对色觉障碍可读；但 aria-checked 必须正确，
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
 * 几何常量（v0.6.5：18×18 → 16×16；内块与描边改为同一元素上的两层盒内阴影）。
 *
 * 内块 10px，四周留 3px——留白必须是**整数**，理由与v0.6.4相同，见文件头。
 *
 * **描边与外框圆角不缩**：等比会得到 1.23px / 3.27px 两个非整数魔法数，且 1.23px 在
 * 非整数 DPI 下会渲染成半像素发虚。1.5px 是本仓既有的强调描边档（词性 pill 同款），
 * 圆角保留 --radius-sm token。代价是「描边:边长」升到 9.4%，视觉上略重一点。
 *
 * 内块**没有**自己的圆角常量了：它是盒内阴影挖出来的中心区域，圆角由浏览器按
 * 「元素圆角 − 内缩」推导（4 − 3 = 1px），三条带（描边 / 留白 / 内块）因此是同心的，
 * 每一圈的角都跟着自己的内缩走。手工挑过的那一档（22px 时期的 2px）反而让内块的四角
 * 几乎顶到描边——那是个只有放大才看得出来、但确实存在的偏心来源，一并去掉了。
 *
 * 抽成常量是为了可测：node 环境下断言不到 DOM，只能钉常量契约。
 */
export const CHECKBOX_SIZE = 16
export const CHECKBOX_INNER = 10
/** 描边宽度。与词性 pill 同一档，见上。 */
export const CHECKBOX_RING = 1.5

/**
 * 控件的涂装（v0.6.5 修订）：底色 + 两层盒内阴影，**不再有内块子元素**。
 *
 * 下标为 0 的阴影画在**最上层**，故顺序是「描边在留白之上」：
 *   0 – 1.5px  描边（未选：描边色；选中：内块色——与外框同色，它才是被看到的那一圈）
 *   1.5 – 3px  留白（底色，对外框和背景取同一色，于是未选态只有一圈描边）
 *   3px 以内   元素自己的 background（未选 = 底色「空心」；选中 = 内块色，即 10px 的色块）
 * 选中态那条「内块」就是 background 本身，因此**内块的位置由外框的盒子决定，没有第二个
 * 盒子可以偏离它**——这条不变式是该函数存在的全部理由，也是它可测的地方。
 *
 * 两个状态都固定给两层阴影（而不是选中时多一层）：阴影层数不同的过渡不会插值，勾选时
 * 会「啪」地跳一下，层数一致才留下 box-shadow 的颜色过渡。
 */
export function checkboxPaint({ checked, hover, disabled, color }: {
  checked: boolean; hover: boolean; disabled?: boolean; color: string
}): { background: string; boxShadow: string } {
  const { border, fill } = checkboxAppearance({ checked, hover, disabled, color })
  const inset = (CHECKBOX_SIZE - CHECKBOX_INNER) / 2
  return {
    background: fill ?? 'var(--color-surface)',
    boxShadow: `inset 0 0 0 ${CHECKBOX_RING}px ${fill ?? border}, inset 0 0 0 ${inset}px var(--color-surface)`,
  }
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
  const paint = checkboxPaint({ checked, hover, disabled, color: c })
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
        display: 'inline-flex', borderRadius: 'var(--radius-sm)',
        background: paint.background,
        // 描边与内块共用这一条：两层盒内阴影都不占空间（不像真 border 会压内容盒），
        // 且都是画出来的路径而非布局盒子，不参与设备像素取整——v0.6.4 那个
        // 「色块没居中」的两半成因到这一版才都堵上，见文件头。
        boxShadow: paint.boxShadow,
        opacity: disabled ? 0.38 : 1,
        transition: 'box-shadow var(--duration-fast) var(--ease-smooth), background-color var(--duration-fast) var(--ease-smooth)',
      }}
    />
  )
}
