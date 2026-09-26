import type { CSSProperties } from 'react'
import { useViewStore } from '../../stores/viewStore'
import { useNavHistoryStore } from '../../stores/navHistoryStore'
import { useWordStore } from '../../stores/wordStore'
import { canGoBack, canGoForward } from '../../lib/navHistory'
import Icon from '../icons'
import SquareButton from '../ui/SquareButton'
import Tooltip from '../ui/Tooltip'

interface WorkbenchNavBarProps {
  /** 所在区域：工作台显示编者/删除，搜索返回页显示返回/合并添加 */
  region: 'workbench' | 'dict'
  /** 删除当前词条（仅 region='workbench' 使用） */
  onDeleteWord?: () => void
  /** 左箭头行为（仅 region='dict' 使用）：返回工作台 */
  onBack?: () => void
  /** 右端合并添加（仅 region='dict' 使用） */
  onMergeAdd?: () => void
  mergeCount?: number
  mergeDisabled?: boolean
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
export default function WorkbenchNavBar({
  region, onDeleteWord, onBack, onMergeAdd, mergeCount = 0, mergeDisabled = false,
}: WorkbenchNavBarProps) {
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
        type="button"
        title={region === 'dict' ? '返回' : '上一个词条'}
        aria-label={region === 'dict' ? '返回' : '上一个词条'}
        disabled={region === 'workbench' && !canGoBack(history)}
        onClick={() => region === 'dict' ? onBack?.() : go('back')}
        onMouseEnter={hoverOn}
        onMouseLeave={hoverOff}
        style={navBtn(region === 'workbench' && !canGoBack(history))}
      >
        <Icon name="arrow-left" size={15} />
      </button>
      {/* dict 区无法推进历史指针，其前进箭头必然禁用，故不渲染 */}
      {region === 'workbench' && (
        <button
          type="button"
          title="下一个词条"
          aria-label="下一个词条"
          disabled={!canGoForward(history)}
          onClick={() => go('forward')}
          onMouseEnter={hoverOn}
          onMouseLeave={hoverOff}
          style={navBtn(!canGoForward(history))}
        >
          <Icon name="arrow-right" size={15} />
        </button>
      )}

      {/* ⋯ 更多操作（普通模式可见）本轮不实现：⋯ 菜单内容与「删除此标签页」收进菜单是 v0.7.0 段二的独立项，
          本轮没有可放入 ⋯ 的条目；等段二落地时在本组件右侧补上即可。
          ＋ 新增标签页已移除：它与标签条右侧的 ＋ 重复（同一 TAB_GROUPS 选择器），标签条那处保留为唯一入口。 */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {region === 'workbench' ? (
          <>
            {/* 编者模式（v0.5.3 §4.1 第 16 条重做）：形态开关，开 = 浅品牌蓝底 + 深字、关 = 暖中性底，
                两态只差底色，几何完全一致，故切换时导航条不跳动。role="switch" + aria-checked
                保留语义（不用 aria-pressed：它与 aria-checked 语义重复且优先级不明）。
                hover 与按压回弹由 SquareButton 内部处理，这里不再手写 onMouse*。
                不加 title：accname 2.2 里 title 早于 name-from-content，会把可及名钉成常量，
                而这里的状态由 aria-checked 播报、可见文字「编者」本身已够指名。 */}
            <SquareButton
              size="nav"
              pressed={editorMode}
              role="switch"
              aria-checked={editorMode}
              aria-label="编者模式"
              onClick={() => setEditorMode(!editorMode)}
            >
              <Icon name="edit" size={12} />
              编者
            </SquareButton>

            <button
              type="button" title="删除词条" aria-label="删除词条" onClick={onDeleteWord}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-danger)' }}
              onMouseLeave={hoverOff}
              style={navBtn()}
            >
              <Icon name="trash" size={15} />
            </button>
          </>
        ) : (
          // 合并添加（dict 区）：悬浮说明走 Tooltip 包裹而非 title 属性——accname 2.2 里
          // title 早于 name-from-content，一挂就把可及名钉成常量「合并添加」，
          // 「· N 项」永远不被读出（Icon 是 aria-hidden，不参与命名）。
          <Tooltip content={mergeCount > 0 ? `把勾选的 ${mergeCount} 项合并添加进词条` : '先勾选要添加的词条'} width={260}>
            <SquareButton
              size="nav"
              disabled={mergeDisabled}
              onClick={() => onMergeAdd?.()}
            >
              <Icon name="plus" size={12} />
              合并添加{mergeCount > 0 ? ` · ${mergeCount} 项` : ''}
            </SquareButton>
          </Tooltip>
        )}
      </div>
    </div>
  )
}
