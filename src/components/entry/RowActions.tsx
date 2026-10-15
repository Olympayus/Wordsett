import type { CSSProperties, ReactNode } from 'react'
import { NAV_CONTROL_HEIGHT } from '../../lib/layout'

/** 行尾两枚图标键的共用配方：中性、无边框、hover 才起底（v0.7.2 蓝不做可点提示）。
 *  颜色走 `inherit`——由 RowActions 的簇容器按显隐给色（静止 / 悬停两态），
 *  配方本身不钉死一个颜色（v0.7.2 缺陷 4：静止态要更淡、悬停态要更实）。 */
export const rowIconStyle: CSSProperties = {
  width: `${NAV_CONTROL_HEIGHT}px`, height: `${NAV_CONTROL_HEIGHT}px`,
  display: 'grid', placeItems: 'center', border: 'none', borderRadius: 'var(--radius-md)',
  background: 'transparent', color: 'inherit', cursor: 'pointer',
  fontSize: '12px', lineHeight: 1, transition: 'background-color var(--duration-fast) var(--ease-smooth), color var(--duration-fast) var(--ease-smooth)',
}

/**
 * 行尾操作簇（v0.7.2）：`＋` 加到本行所在容器，`⋯` 打开菜单（编辑 / 添加同级 / 删除）。
 *
 * **必须常驻占位、只用 opacity 显隐**——这是 v0.5.2 修 hover 折行抖动时定下的做法：
 * 控件进出 DOM 会让该行可用宽度骤减、值文本重新折行、下方内容整体位移，鼠标在行间
 * 上下移动时来回弹。`visible` 由父级给：**只有悬停行及其祖先链为 true**（编者模式不再
 * 恒 true——v0.7.2 二轮用户要求「完全隐藏，不可见」，编者模式同理）。
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
 */
export default function RowActions({ visible, onAdd, menu }: { visible: boolean; onAdd: () => void; menu: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', flex: 'none',
                   opacity: visible ? 1 : 0,
                   visibility: visible ? 'visible' : 'hidden',
                   pointerEvents: visible ? 'auto' : 'none',
                   color: visible ? 'var(--color-text-primary)' : 'var(--color-border-strong)',
                   transition: 'opacity var(--duration-fast) var(--ease-smooth), color var(--duration-fast) var(--ease-smooth)' }}>
      <button type="button" aria-label="加到本容器" onClick={onAdd} style={rowIconStyle}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text-primary)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'inherit' }}>＋</button>
      {menu}
    </span>
  )
}
