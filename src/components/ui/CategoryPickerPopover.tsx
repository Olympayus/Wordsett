import { useCategoryStore } from '../../stores/categoryStore'
import { useUiStore } from '../../stores/uiStore'
import Icon from '../icons'

/**
 * 分类下拉浮层（v0.6.5 §4.6）。侧栏批量条的「加入分类 / 从分类移除」与词典返回页的「＋」
 * 共用同一枚组件——两处的选项集合与语义完全相同，各写一份会漂。
 *
 * 不设「未分类」项：不加入任何分类就是归类为空，那是「从分类移除」的语义。
 * 一个分类都没有时给空态 + 「新建分类」，点它只开分类编辑器，**不接着执行原动作**——
 * 避免「建完分类后要不要继续」这种半途状态。
 *
 * 定位契约：调用方必须把自己包在 `position: relative` 的容器里，面板按该容器的边定位，
 * 不动 onPick / onClose / align 三者的名字与语义。`placement` 是本组件自己的一条附加开关，
 * 默认 'bottom'（面板落在容器下沿，词典返回页的顶栏「＋」正是这个方向）；
 * 侧栏批量条贴侧栏底部、而祖先 AppShell 的 <aside> 带 overflow: hidden，
 * 向下会被裁掉，所以它显式传 'top'。
 *
 * 全屏透明遮罩用 position: fixed：它只负责捕获外部点击，不需要跟着容器走，
 * 且这样才不会被祖先的 overflow 裁掉（面板本身仍受祖先裁剪）。
 */
export default function CategoryPickerPopover({ onPick, onClose, align = 'right', placement = 'bottom' }: {
  onPick: (categoryId: string) => void
  onClose: () => void
  align?: 'left' | 'right'
  placement?: 'bottom' | 'top'
}) {
  const categories = useCategoryStore(s => s.categories)
  const openEditor = useUiStore(s => s.openEditor)

  return (
    <>
      {/* 点外面关闭：捕获阶段挂 document，避免与触发器自身的 click 打架 */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-dropdown)' }}
        onClick={onClose}
      />
      <div
        role="menu"
        style={{
          position: 'absolute',
          zIndex: 'calc(var(--z-dropdown) + 1)',
          ...(placement === 'bottom' ? { top: 'calc(100% + 4px)' } : { bottom: 'calc(100% + 4px)' }),
          ...(align === 'left' ? { left: 0 } : { right: 0 }),
          width: '220px', padding: '6px',
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-overlay)',
        }}
      >
        {categories.length === 0 ? (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', padding: '6px 9px' }}>
            还没有分类
          </div>
        ) : categories.map(cat => (
          <button
            key={cat.id}
            type="button"
            role="menuitem"
            onClick={() => onPick(cat.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '9px', width: '100%',
              padding: '7px 9px', border: 'none', background: 'transparent', borderRadius: 'var(--radius-md)',
              cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {cat.name}
            </span>
          </button>
        ))}
        <div style={{ height: 1, background: 'var(--color-border)', margin: '4px 6px' }} />
        <button
          type="button"
          onClick={() => { onClose(); openEditor(null, null) }}
          style={{
            display: 'flex', alignItems: 'center', gap: '9px', width: '100%',
            padding: '7px 9px', border: 'none', background: 'transparent', borderRadius: 'var(--radius-md)',
            cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
            color: 'var(--color-text-secondary)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          <span style={{ width: 10, textAlign: 'center' }}><Icon name="plus" size={10} /></span>
          新建分类
        </button>
      </div>
    </>
  )
}
