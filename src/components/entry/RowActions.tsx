import type { CSSProperties, ReactNode } from 'react'
import { NAV_CONTROL_HEIGHT } from '../../lib/layout'

/** 行尾两枚图标键的共用配方：中性、无边框、hover 才起底（v0.7.2 蓝不做可点提示）。 */
export const rowIconStyle: CSSProperties = {
  width: `${NAV_CONTROL_HEIGHT}px`, height: `${NAV_CONTROL_HEIGHT}px`,
  display: 'grid', placeItems: 'center', border: 'none', borderRadius: 'var(--radius-md)',
  background: 'transparent', color: 'var(--color-text-tertiary)', cursor: 'pointer',
  fontSize: '12px', lineHeight: 1, transition: 'background-color var(--duration-fast) var(--ease-smooth), color var(--duration-fast) var(--ease-smooth)',
}

/**
 * 行尾操作簇（v0.7.2）：`＋` 加到本行所在容器，`⋯` 打开菜单（编辑 / 添加同级 / 删除）。
 *
 * **必须常驻占位、只用 opacity 显隐**——这是 v0.5.2 修 hover 折行抖动时定下的做法：
 * 控件进出 DOM 会让该行可用宽度骤减、值文本重新折行、下方内容整体位移，鼠标在行间
 * 上下移动时来回弹。`visible` 由父级给：编者模式恒 true，普通模式由行的 hover 驱动。
 */
export default function RowActions({ visible, onAdd, menu }: { visible: boolean; onAdd: () => void; menu: ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', flex: 'none',
                   opacity: visible ? 1 : 0.3, transition: 'opacity var(--duration-fast) var(--ease-smooth)' }}>
      <button type="button" aria-label="加到本容器" onClick={onAdd} style={rowIconStyle}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text-primary)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-tertiary)' }}>＋</button>
      {menu}
    </span>
  )
}
