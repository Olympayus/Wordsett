import type { CSSProperties, ReactNode } from 'react'
import { NAV_CONTROL_HEIGHT } from '../../lib/layout'
import Icon from '../icons'

/** 行尾两枚图标键的共用配方：中性、无边框、hover 才起底（v0.7.2 蓝不做可点提示）。
 *  颜色走 `inherit`——由 RowActions 的簇容器按显隐给色（静止 / 悬停两态），
 *  配方本身不钉死一个颜色（v0.7.2 缺陷 4：静止态要更淡、悬停态要更实）。 */
export const rowIconStyle: CSSProperties = {
  width: `${NAV_CONTROL_HEIGHT}px`, height: `${NAV_CONTROL_HEIGHT}px`,
  display: 'grid', placeItems: 'center', border: 'none', borderRadius: 'var(--radius-md)',
  background: 'transparent', color: 'inherit', cursor: 'pointer',
  fontSize: '12px', lineHeight: 1, transition: 'background-color var(--duration-fast) var(--ease-smooth), color var(--duration-fast) var(--ease-smooth)',
}

/** 编者模式操作簇的宽度：两枚 22px 按钮 ＋ 簇内 `gap: 2` ＝ 46px。
 *  普通模式只有一枚 `⋯`，但**按编者模式实际会渲染的形态预留同宽**并右对齐：传了 `onAdd`
 *  的调用点预留这 46px；没传的（单位行尾槽）其 edit 形态只有一枚垃圾桶，故预留
 *  `NAV_CONTROL_HEIGHT`（22px）——见组件注释的常驻占位不变量。 */
const EDIT_CLUSTER_WIDTH = NAV_CONTROL_HEIGHT * 2 + 2

/**
 * 行尾操作簇（v0.7.3）：两套形态按 `mode` 分流。
 *
 * - `'view'`（普通模式）：**所有**动作并进 `⋯` 菜单（编辑 / 添加子项 / 删除）——
 *   行尾只留一枚 `⋯`，先前那个独立的 `＋` 已挪进菜单。v0.7.4 决定三：**行级只删不加**，
 *   「添加同级」全站撤掉，「添加子项」只留给真正的容器或有可加子类的行。
 * - `'edit'`（编者模式）：`＋`（加到本行所在容器）与垃圾桶（删除本行），**没有** `⋯`——
 *   编者模式要的是就地增删，再叠一层菜单是多余的一跳。
 *
 * **必须常驻占位、只用 opacity 显隐**——这是 v0.5.2 修 hover 折行抖动时定下的做法：
 * 控件进出 DOM 会让该行可用宽度骤减、值文本重新折行、下方内容整体位移，鼠标在行间
 * 上下移动时来回弹。`visible` 由父级给：**只有悬停行及其祖先链为 true**（编者模式不再
 * 恒 true——v0.7.2 二轮用户要求「完全隐藏，不可见」，编者模式同理）。
 *
 * **两种模式的占宽也必须相同**（v0.7.4 修复轮）：普通模式只有一枚 22px 的 `⋯`，故它预留的
 * 宽度必须**照抄编者模式实际会渲染的形态**——带 `onAdd` 时是 22 + 2 + 22 = 46px，不带
 * `onAdd`（只服务单位行尾槽）时只有垃圾桶一枚 22px。这个簇在 `FlowRow` 的 `end` 槽里是
 * **在流内**的：若两种模式各占各的宽度，切换编辑器模式就会让每一行的正文宽跳变、长释义
 * 重新折行。单位槽则在 `LeafFlow` 的流外 22px 绝对定位格子里（`left: 100%; width: 22px`），
 * 多留 24px 会直接溢到右侧邻词上——故预留值不能写死成 46。普通模式把 `⋯` 右对齐，按钮的
 * 视觉位置仍在右缘，只是左边的空白先占住了。
 *
 * 隐藏态是**真的不可见、且不可交互**（v0.7.2 二轮）：`opacity: 0` 只是第一步——
 * 透明控件仍在 Tab 序列与无障碍树里，Tab+Enter 会误触删除 / 加子词条，0 透明度下的
 * 可聚焦本身就是键盘回归。故同时上 `visibility: hidden`（移出 Tab 序列与无障碍树、
 * 且被子孙继承）与 `pointer-events: none`（吃掉指针）。**刻意不用 `display: none`、
 * 也不卸载**：那会让簇离开布局、行的可用宽度骤减，正是 v0.5.2 修掉的那个抖动，
 * `WordWorkbench.test.ts` 的源码形状守卫也钉着这一点。
 *
 * 颜色仍按显隐给两档（`visible` 时主色、隐藏时 `--color-border-strong`）：0 透明度下
 * 它不影响观感，但 `rowIconStyle` 的 `color: inherit` 要靠它拿「静止态该是什么色」，
 * 且 90ms 的 color 过渡让显形那一刻不跳。
 *
 * v0.7.3 尾段 §3.4：`onAdd` 改可选——**不传即不渲染那枚 `＋`**。
 * 不传 `onAdd` 的形态服务单位自己的行尾槽：它在普通模式是 `mode='view'` 的一枚 `⋯`，
 * 编者模式则是 `mode='edit'` 的一枚垃圾桶（`WordWorkbench` 的单位调用点传的是
 * `mode={editorMode ? 'edit' : 'view'}` 且不给 `onAdd`）——两态都只有一枚 22px 按钮，
 * 故普通模式预留的就是 22px 而不是 46px。行尾簇的不变量（常驻占位、只用 opacity 显隐、
 * 绝不条件渲染）管的是**整簇**的进出，与簇内某枚图标的可选性是两回事。
 */
export default function RowActions({ visible, mode, onAdd, onDelete, menu }: {
  visible: boolean
  /** 'view' = 普通模式（只有 ⋯）；'edit' = 编者模式（＋ 与垃圾桶，没有 ⋯）。 */
  mode: 'view' | 'edit'
  /** 可选：不传即不渲染 ＋（编者模式那枚「加到本容器」）。 */
  onAdd?: () => void
  onDelete: () => void
  menu: ReactNode
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', flex: 'none',
                   width: mode === 'view' ? `${onAdd ? EDIT_CLUSTER_WIDTH : NAV_CONTROL_HEIGHT}px` : undefined,
                   justifyContent: mode === 'view' ? 'flex-end' : undefined,
                   opacity: visible ? 1 : 0,
                   visibility: visible ? 'visible' : 'hidden',
                   pointerEvents: visible ? 'auto' : 'none',
                   color: visible ? 'var(--color-text-primary)' : 'var(--color-border-strong)',
                   transition: 'opacity var(--duration-fast) var(--ease-smooth), color var(--duration-fast) var(--ease-smooth)' }}>
      {mode === 'edit' ? (
        <>
          {onAdd && (
            <button type="button" aria-label="加到本容器" onClick={onAdd} style={rowIconStyle}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'inherit' }}>＋</button>
          )}
          <button type="button" aria-label="删除本行" onClick={onDelete} style={rowIconStyle}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-danger)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'inherit' }}>
            <Icon name="trash" size={15} />
          </button>
        </>
      ) : menu}
    </span>
  )
}
