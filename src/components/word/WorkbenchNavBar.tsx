import type { CSSProperties } from 'react'
import { useViewStore } from '../../stores/viewStore'
import { useNavHistoryStore } from '../../stores/navHistoryStore'
import { useWordStore } from '../../stores/wordStore'
import { canGoBack, canGoForward } from '../../lib/navHistory'
import Icon from '../icons'

interface WorkbenchNavBarProps {
  /** 删除当前词条（词头垃圾桶移出后的唯一主入口） */
  onDeleteWord: () => void
}

// 导航按钮（V8 .nav-btn）：28×28、无边框无底色，hover 才起底色
const navBtn = (disabled = false): CSSProperties => ({
  width: '28px', height: '28px', flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', background: 'transparent', borderRadius: 'var(--radius-md)',
  cursor: disabled ? 'default' : 'pointer',
  color: 'var(--color-text-secondary)',
  opacity: disabled ? 0.3 : 1,
  transition: 'background-color var(--duration-fast) var(--ease-smooth), color var(--duration-fast) var(--ease-smooth)',
})

// 词条导航条（v0.5.2 §6）：编辑区顶部、词条内容区之外的独立功能区，吸顶。
// 箭头是浏览器式前进 / 后退，走用户访问轨迹，不是词表顺序。
// 形态对齐 V8 原型 .ed-toolbar：圆角描边浮条（--color-surface 底 + 1px 描边），而非仅一条下边框。
export default function WorkbenchNavBar({ onDeleteWord }: WorkbenchNavBarProps) {
  const editorMode = useViewStore(s => s.editorMode)
  const setEditorMode = useViewStore(s => s.setEditorMode)
  const history = useNavHistoryStore(s => s.history)
  const selectWord = useWordStore(s => s.selectWord)

  // 导航切换不入栈（record:false），否则后退会立刻变成前进
  const go = (dir: 'back' | 'forward') => {
    const nav = useNavHistoryStore.getState()
    const target = dir === 'back' ? nav.goBack() : nav.goForward()
    if (target) void selectWord(target, { record: false })
  }

  // V8 .nav-btn:hover：hover 起底色并转主色
  const hoverOn = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.currentTarget.disabled) return
    e.currentTarget.style.background = 'var(--color-surface-hover)'
    e.currentTarget.style.color = 'var(--color-text-primary)'
  }
  const hoverOff = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'transparent'
    e.currentTarget.style.color = 'var(--color-text-secondary)'
  }

  return (
    <div
      style={{
        // 吸顶（spec §6）+ 圆角描边浮条（V8 .ed-toolbar 的形态，底色取主题暖色而非纯白）
        position: 'sticky', top: 0, zIndex: 'var(--z-sticky)',
        display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap',
        background: 'var(--color-canvas)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '6px 8px', marginBottom: '18px',
      }}
    >
      <button
        type="button" title="上一个词条" aria-label="上一个词条"
        disabled={!canGoBack(history)}
        onClick={() => go('back')}
        onMouseEnter={hoverOn}
        onMouseLeave={hoverOff}
        style={navBtn(!canGoBack(history))}
      >
        <Icon name="arrow-left" size={15} />
      </button>
      <button
        type="button" title="下一个词条" aria-label="下一个词条"
        disabled={!canGoForward(history)}
        onClick={() => go('forward')}
        onMouseEnter={hoverOn}
        onMouseLeave={hoverOff}
        style={navBtn(!canGoForward(history))}
      >
        <Icon name="arrow-right" size={15} />
      </button>

      {/* ⋯ 更多操作（普通模式可见）本轮不实现：⋯ 菜单内容与「删除此标签页」收进菜单是 v0.7.0 段二的独立项，
          本轮没有可放入 ⋯ 的条目；等段二落地时在本组件右侧补上即可。
          ＋ 新增标签页已移除：它与标签条右侧的 ＋ 重复（同一 TAB_GROUPS 选择器），标签条那处保留为唯一入口。 */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button
          type="button"
          role="switch"
          aria-checked={editorMode}
          aria-label="编者模式"
          onClick={() => setEditorMode(!editorMode)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            height: '26px', padding: '0 11px', flexShrink: 0,
            border: `1px solid ${editorMode ? 'var(--color-brand)' : 'var(--color-border)'}`,
            background: editorMode ? 'var(--color-brand-soft)' : 'transparent',
            borderRadius: 'var(--radius-full)', cursor: 'pointer',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)',
            color: editorMode ? 'var(--color-brand)' : 'var(--color-text-secondary)',
            transition: 'background-color var(--duration-fast) var(--ease-smooth), border-color var(--duration-fast) var(--ease-smooth), color var(--duration-fast) var(--ease-smooth)',
          }}
        >
          <Icon name="edit" size={12} />
          编者
        </button>

        <button
          type="button" title="删除词条" aria-label="删除词条" onClick={onDeleteWord}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-danger)' }}
          onMouseLeave={hoverOff}
          style={navBtn()}
        >
          <Icon name="trash" size={15} />
        </button>
      </div>
    </div>
  )
}
