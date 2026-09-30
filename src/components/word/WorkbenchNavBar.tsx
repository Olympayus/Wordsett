import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useViewStore } from '../../stores/viewStore'
import { useNavHistoryStore } from '../../stores/navHistoryStore'
import { useWordStore } from '../../stores/wordStore'
import { canGoBack, canGoForward } from '../../lib/navHistory'
import Icon from '../icons'
import SquareButton from '../ui/SquareButton'
import Tooltip from '../ui/Tooltip'
import CategoryPickerPopover from '../ui/CategoryPickerPopover'
import FamiliarityChoice from '../search/FamiliarityChoice'
import type { InitialFamiliarityChoice } from '../../services/wordService'

interface WorkbenchNavBarProps {
  /** 所在区域：工作台显示编者/删除，搜索返回页显示返回/合并添加 */
  region: 'workbench' | 'dict'
  /** 删除当前词条（仅 region='workbench' 使用） */
  onDeleteWord?: () => void
  /** 左箭头行为（仅 region='dict' 使用）：返回工作台 */
  onBack?: () => void
  /** 右端合并添加（仅 region='dict' 使用）。categoryId 是「＋」路径选的分类：
   *  不传＝主按钮，只走合并（落默认分类）；传了＝合并成功后再多归入这一个分类。 */
  onMergeAdd?: (categoryId?: string) => void
  mergeCount?: number
  mergeDisabled?: boolean
  /** 词不在库时的初始熟悉度单选（region='dict' 使用）。 */
  familiarity?: InitialFamiliarityChoice
  onFamiliarityChange?: (v: InitialFamiliarityChoice) => void
  /** 词已在库：三键整组换成「已在库」四字，保持右端宽度接近、按钮不左右跳。 */
  inLibrary?: boolean
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
  familiarity, onFamiliarityChange, inLibrary = false,
}: WorkbenchNavBarProps) {
  const editorMode = useViewStore(s => s.editorMode)
  const setEditorMode = useViewStore(s => s.setEditorMode)
  const history = useNavHistoryStore(s => s.history)
  const selectWord = useWordStore(s => s.selectWord)
  // 「＋」分类下拉的开关（仅 dict 区用），以及那对按钮所在的容器——浮层的锚点
  // （v0.6.5 修订：浮层已是 fixed 落位，锚点由它现算。原来这里靠 position: relative
  //  让面板按容器下沿展开，那条契约已被 popoverPosition 取代）。
  const [pickerOpen, setPickerOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)

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
        display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
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
      {/* 右端簇自己也要能换行：外层 flexWrap:'wrap' 只保证这一簇在放不下时整体挪到第二行，
          簇内若还是 nowrap（默认），窄窗口下它会先溢出而不是内部重排。justifyContent:'flex-end'
          让换出来的第二行仍靠右对齐，不至于左边缘不齐。 */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
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
          <>
            {/* 初始熟悉度三键（v0.6.5 §4.5，从页面底部收录区上移）：词不在库时可选，缺省落第 1 档「陌生」。
                词已在库则整组换成灰色「已在库」四字——这一支与三键的右端宽度接近，切词时按钮不左右跳。 */}
            {inLibrary ? (
              <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>已在库</span>
            ) : (
              <>
                <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>初始熟悉度</span>
                {/* 三个入参都是可选的：调用方只传 familiarity 而不传 onFamiliarityChange 时，
                    三键会是「看得见、点得动、什么都不做」的哑控件。disabled 让降级可见而不是静默。 */}
                <FamiliarityChoice value={familiarity ?? 1} onChange={v => onFamiliarityChange?.(v)} disabled={!onFamiliarityChange} />
              </>
            )}
            {/* 添加动作拆成两颗（v0.6.5 §4.6）：主按钮的行为与改前逐字相同（不传 categoryId，
                合并后落进默认分类）；「＋」做同一件事，只在选中分类时成功后多归入该分类——
                词已在库时这条路径依然有意义（v0.6.5 唯一的新能力）。
                两者共用 onMergeAdd 这一个入口，反馈不会分叉。
                v0.6.5 修订：这里原有一个 minWidth: 220 的空壳，用来给 absolute 定位的下拉
                撑出宽度；下拉改成 fixed 落位后宽度不再由祖先决定，空壳去掉——它同时正是
                「＋ 看着没右对齐」的成因（按钮靠左排、右边留了 190px 空档）。
                容器现在紧贴两颗按钮，故它同时是浮层的锚点元素。 */}
            <div ref={anchorRef} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {/* 悬浮说明走 Tooltip 包裹而非 title 属性——accname 2.2 里 title 早于 name-from-content，
                  一挂就把可及名钉成常量「合并添加」，「· N 项」永远不被读出（Icon 是 aria-hidden，不参与命名）。 */}
              <Tooltip content={mergeCount > 0 ? `把勾选的 ${mergeCount} 项合并添加进词条` : '先勾选要添加的词条'} width={260}>
                <SquareButton
                  size="nav"
                  disabled={mergeDisabled}
                  onClick={() => onMergeAdd?.()}
                >
                  合并添加{mergeCount > 0 ? <> · <span className="stat-num">{mergeCount}</span> 项</> : ''}
                </SquareButton>
              </Tooltip>
              <SquareButton
                size="nav"
                aria-label="选择分类后添加"
                disabled={mergeDisabled}
                onClick={() => setPickerOpen(o => !o)}
              >
                <Icon name="plus" size={12} />
              </SquareButton>
              {/* 不传 placement：默认 'bottom'（向下）对页面顶部的导航条是对的。
                  onPick 里先关浮层再执行添加，浮层不会悬在已经跳走的页面残影上。
                  导航条虽然是 sticky（自成层叠上下文），但 fixed 的包含块仍是视口，
                  面板不会因此被裁——只有 transform / will-change / contain: paint
                  才会把 fixed 的包含块改成祖先，本组件没有这些。 */}
              {pickerOpen && (
                <CategoryPickerPopover anchor={anchorRef.current} onClose={() => setPickerOpen(false)}
                  onPick={categoryId => { setPickerOpen(false); void onMergeAdd?.(categoryId) }} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
