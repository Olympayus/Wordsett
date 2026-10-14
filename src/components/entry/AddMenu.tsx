import type { CSSProperties, ReactNode } from 'react'

export interface AddItem { key: string; label: string; onPick: () => void }

/**
 * 「更多操作 / 添加」菜单项的统一样式（原 `WordWorkbench.tsx` 的 `menuItemStyle`，v0.7.2 移到这里）。
 * hover 一律中性底色（`--color-surface-hover`），不再转品牌蓝——蓝只留给激活 / 选中 / 标记。
 */
export const menuItemStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '6px 10px',
  border: 'none',
  background: 'transparent',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  color: 'var(--color-text-primary)',
  fontSize: 'var(--text-sm)',
  fontFamily: 'var(--font-sans)',
  whiteSpace: 'nowrap',
  transition: 'background-color var(--duration-fast) var(--ease-smooth), color var(--duration-fast) var(--ease-smooth)',
}

/** 菜单项的中性 hover：进入起底、离开还原（不碰字色，字色由调用方按语义给）。 */
export function menuItemHover(on: boolean, el: HTMLElement) {
  el.style.background = on ? 'var(--color-surface-hover)' : 'transparent'
}

/**
 * 「＋ 添加」的菜单（v0.7.2）。页级与行级共用一份实现，只有条目不同：
 * 页级含「新建标签页 / 词根 / 音标」（由 `extra` 承载），行级只含该容器可加的子类型
 * （沿用 `addableLeafKeys` / `ALLOWED_CHILD_KEYS` 的判据）。
 * 先前这四种添加散在四处、三种形态（通栏虚线按钮 / 容器内虚线圆钮 / 页签上的小 ＋）。
 *
 * 面板本身不定位——调用方把它放进 `position: relative` 的锚点容器里。
 */
export default function AddMenu({ title, items, extra }: { title: string; items: AddItem[]; extra?: ReactNode }) {
  return (
    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-overlay)', padding: '5px', minWidth: '170px' }}>
      <div style={{ fontSize: '10.5px', color: 'var(--color-text-tertiary)', padding: '4px 9px 2px' }}>{title}</div>
      {items.map(i => (
        <button
          key={i.key}
          type="button"
          onClick={i.onPick}
          style={menuItemStyle}
          onMouseEnter={e => menuItemHover(true, e.currentTarget)}
          onMouseLeave={e => menuItemHover(false, e.currentTarget)}
        >
          {i.label}
        </button>
      ))}
      {extra}
    </div>
  )
}
