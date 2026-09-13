import { useState, type CSSProperties } from 'react'
import type { TabKey } from '../../lib/tabs'
import { TAB_GROUPS } from '../../lib/tabs'
import { useViewStore } from '../../stores/viewStore'
import { useNavHistoryStore } from '../../stores/navHistoryStore'
import { useWordStore } from '../../stores/wordStore'
import { canGoBack, canGoForward } from '../../lib/navHistory'
import Icon from '../icons'

interface WorkbenchNavBarProps {
  /** 新增标签页（编者模式可见） */
  onAddTab: (tab: TabKey) => void
  /** 新增标签页候选（尚未存在的标签页） */
  missingTabs: TabKey[]
  /** 删除当前词条（普通模式 ⋯ 菜单之外的主入口） */
  onDeleteWord: () => void
}

const iconBtn = (disabled = false): CSSProperties => ({
  width: '26px', height: '26px', flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', background: 'transparent', borderRadius: 'var(--radius-md)',
  cursor: disabled ? 'default' : 'pointer',
  color: disabled ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
  opacity: disabled ? 0.45 : 1,
  transition: 'background-color var(--duration-fast) var(--ease-smooth), color var(--duration-fast) var(--ease-smooth)',
})

// 词条导航条（v0.5.2 §6）：编辑区顶部、词条内容区之外的独立功能区。
// 箭头是浏览器式前进 / 后退，走用户访问轨迹，不是词表顺序。
export default function WorkbenchNavBar({ onAddTab, missingTabs, onDeleteWord }: WorkbenchNavBarProps) {
  const editorMode = useViewStore(s => s.editorMode)
  const setEditorMode = useViewStore(s => s.setEditorMode)
  const history = useNavHistoryStore(s => s.history)
  const selectWord = useWordStore(s => s.selectWord)
  const [addOpen, setAddOpen] = useState(false)

  // 导航切换不入栈（record:false），否则后退会立刻变成前进
  const go = (dir: 'back' | 'forward') => {
    const nav = useNavHistoryStore.getState()
    const target = dir === 'back' ? nav.goBack() : nav.goForward()
    if (target) void selectWord(target, { record: false })
  }

  return (
    <div
      style={{
        position: 'sticky', top: 0, zIndex: 'var(--z-sticky)',
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '3px 0 9px', marginBottom: '12px',
        background: 'var(--color-canvas)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <button
        type="button" title="上一个词条" aria-label="上一个词条"
        disabled={!canGoBack(history)}
        onClick={() => go('back')}
        style={iconBtn(!canGoBack(history))}
      >
        <Icon name="arrow-left" size={15} />
      </button>
      <button
        type="button" title="下一个词条" aria-label="下一个词条"
        disabled={!canGoForward(history)}
        onClick={() => go('forward')}
        style={iconBtn(!canGoForward(history))}
      >
        <Icon name="arrow-right" size={15} />
      </button>

      {/* ⋯ 更多操作（普通模式可见）本轮不实现：⋯ 菜单内容与「删除此标签页」收进菜单是 v0.7.0 段二的独立项，
          本轮没有可放入 ⋯ 的条目；等段二落地时在本组件右侧补上即可。 */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button
          type="button"
          role="switch"
          aria-checked={editorMode}
          aria-label="编者模式"
          onClick={() => setEditorMode(!editorMode)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            height: '24px', padding: '0 10px', flexShrink: 0,
            border: 'none', borderRadius: 'var(--radius-full)', cursor: 'pointer',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 600,
            background: editorMode ? 'var(--color-brand)' : 'transparent',
            color: editorMode ? 'var(--color-surface)' : 'var(--color-text-secondary)',
            transition: 'background-color var(--duration-fast) var(--ease-smooth), color var(--duration-fast) var(--ease-smooth)',
          }}
        >
          <Icon name="edit" size={12} />
          编者
        </button>

        {editorMode && (
          <div style={{ position: 'relative' }}>
            <button type="button" title="新增标签页" aria-label="新增标签页" onClick={() => setAddOpen(v => !v)} style={iconBtn()}>
              <Icon name="plus" size={15} />
            </button>
            {addOpen && (
              <>
                {/* 点空白处关闭下拉（遮罩高于导航条其余按钮 z2，低于下拉浮层 z-dropdown） */}
                <div className="fixed inset-0" style={{ zIndex: 2 }} onClick={() => setAddOpen(false)} />
                <div
                  style={{
                    position: 'absolute', right: 0, top: 'calc(100% + 4px)', minWidth: 120, padding: 4,
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                    borderRadius: 6, boxShadow: 'var(--shadow-overlay)', zIndex: 'var(--z-dropdown)',
                  }}
                >
                  {missingTabs.length === 0 && (
                    <div style={{ padding: '6px 10px', fontSize: 13, color: 'var(--color-text-tertiary)' }}>无可添加的标签页</div>
                  )}
                  {missingTabs.map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setAddOpen(false); onAddTab(t) }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px',
                        border: 'none', background: 'transparent', borderRadius: 4, cursor: 'pointer',
                        fontSize: 13, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)',
                      }}
                    >
                      {TAB_GROUPS[t].label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <button
          type="button" title="删除词条" aria-label="删除词条" onClick={onDeleteWord}
          style={{ ...iconBtn(), color: 'var(--color-text-secondary)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-danger)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-secondary)' }}
        >
          <Icon name="trash" size={15} />
        </button>
      </div>
    </div>
  )
}