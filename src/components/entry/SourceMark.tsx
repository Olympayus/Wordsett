import type { FieldState } from '../../lib/fieldState'
import { barExtent } from '../../lib/fieldBar'
import { ROW_PADDING_Y } from '../../lib/layout'

/**
 * 义项左缘那根圆头竖条（v0.7.3 起是**唯一**的来源标记）。
 *
 * 行尾那枚 6px 方点已整个退场（用户：只留颜色条）——`SourceBar` 自身**仍** `aria-hidden`：
 * 它是一根纯视觉的色条，语义由无障碍树里的其他部分承载；去掉 `aria-hidden` 只会让屏幕
 * 阅读器读出一串无意义的空节点（方点在时它尚可与之去重，如今没有第二处了，但本组件
 * 也从未承担命名职责）。
 *
 * `'none'` 不渲染（普通模式与词性窗格）；`'original'` 出中性条——这是 v0.7.3 的新语义，
 * 也是「默认值也有默认颜色的颜色条」这条要求的落点。
 *
 * 左侧留白由 `FlowRow` / `LeafFlow` 自己的左内边距撑住，不靠这根条占位——绝对定位的元素
 * 本就不占位。
 *
 * **分段延伸（v0.7.4 决定八，修复轮改口径）**：条不再逐行各画一小截（那样相邻行看着就是虚线），
 * 而是同段内相接、段与段之间断开。几何交给纯函数 `barExtent(first, last, ROW_PADDING_Y)`：
 * 段中间的行走满**自己**的 padding 盒（0 延伸，与相邻行恰好相接、不重叠），段首行不向上伸、
 * 段末行不向下伸，于是两段之间自然空出 `2 × ROW_PADDING_Y` 的断点。默认 `first = last = true`
 * （独立成段）时上下各内缩 `ROW_PADDING_Y`，与改前的 `top/bottom: 4px` 只差 1px，观感不变——
 * 未接线 `first` / `last` 的调用点因此行为照旧。
 *
 * **不能再向相邻行延伸**（修复轮）：edited / personal 两档是 45% 混色、半透明的，两行各伸
 * `padY` 会在接缝处叠成两层、颜色异常加深——用户看到的「一条释义内色条一段一段」正是它。
 * 与之配套：**圆头只给段的两端**（段首圆上两角、段末圆下两角、中段行不圆角），否则每行四角
 * 都圆会在接缝处收腰，半透明的条读成一串亮点。
 *
 * **`personal` / `edited` 为什么是 45% 混色（Ruling R16，这是一处刻意的例外，别当违规改回去）**：
 * v0.7.2 定下「蓝不做内容数据标记」——蓝只表示状态。可 v0.7.4 起 `personal`（用户创建）
 * 的色相就是蓝，与「正在编辑」的状态蓝同族，实心的蓝条会被读成状态而非来源。
 * 故按决定九的强度表，**竖向段**在 `edited` 与 `personal` 两支都取 **45% 混色**——
 * 把**载体**颜色稀释成淡蓝，与状态蓝拉开；而 `·` / `–` 两枚小标记（Task 11 引入，
 * 由 `Mark.tsx` 画）仍是实心，因为 45% 在那么小的面积上会糊掉。v0.7.3 退场的 6px 方标
 * 已不存在，别再拿它当这条例外的参照。这条例外只针对竖向段的载体色，不是对
 * 「蓝不做内容数据标记」的推翻。
 */
export function SourceBar({ state, first = true, last = true }: {
  state: FieldState
  /** 本行是否是所属段的**首行**：是则条不从本行上方向外延伸（默认 true = 独立成段）。 */
  first?: boolean
  /** 本行是否是所属段的**末行**。 */
  last?: boolean
}) {
  if (state === 'none') return null
  const { top, bottom } = barExtent(first, last, ROW_PADDING_Y)
  const background =
    state === 'personal' ? 'color-mix(in srgb, var(--color-weave-personal) 45%, transparent)'
    : state === 'edited' ? 'color-mix(in srgb, var(--color-weave-edited) 45%, transparent)'
    : 'var(--color-weave-original)'
  // 圆头只给段的两端（见文件头）：中段行是硬接缝，四角都圆会收腰。
  const radius = 'var(--radius-full)'
  const borderRadius =
    first && last ? radius
    : first ? `${radius} ${radius} 0 0`
    : last ? `0 0 ${radius} ${radius}`
    : 0
  return (
    <span aria-hidden style={{
      position: 'absolute', left: 0,
      top: `${top}px`, bottom: `${bottom}px`,
      width: '3px', borderRadius, background,
    }} />
  )
}
