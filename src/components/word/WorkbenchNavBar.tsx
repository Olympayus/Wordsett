import { useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
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
import type { WordLocation } from '../../types'
import { moveActionLabel } from '../../lib/archiveMove'
import { NAV_HEIGHT, NAV_CONTROL_HEIGHT } from '../../lib/layout'

interface WorkbenchNavBarProps {
  /** 所在区域：工作台显示编者/删除，搜索返回页显示返回/合并添加 */
  region: 'workbench' | 'dict'
  /**
   * 当前模块（v0.7.5 Task 11）：决定「移入储藏库 / 移回工作台」按钮的文案。
   * 由调用方从 store 传入——本组件是共享组件，自己不读模块状态。
   */
  location?: WordLocation
  /** 移动当前词（v0.7.5 Task 11）。有值且 region='workbench' 时，在前进箭头右侧出按钮；
   *  调用方负责弹确认框并执行移动（本组件只交出点击）。 */
  onMoveWord?: () => void
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
  /** 有东西正在编辑时显现（工作区唯一）：保存 / 取消。 */
  editing?: { dirty: boolean }
  onSaveEdit?: () => void
  onCancelEdit?: () => void
  /** 返回页（region='dict'）的面包屑（词典 › 词），渲染在返回箭头之后。工作区不传。 */
  breadcrumb?: ReactNode
}

// 导航按钮（V8 .nav-btn）：无边框无底色，hover 才起底色；高取 NAV_CONTROL_HEIGHT，
// 与同排的方块按钮逐像素等高（v0.7.2），否则导航条右端看着是歪的
const navBtn = (disabled = false): CSSProperties => ({
  width: '28px', height: `${NAV_CONTROL_HEIGHT}px`, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', background: 'transparent', borderRadius: 'var(--radius-md)',
  cursor: disabled ? 'default' : 'pointer',
  color: 'var(--color-text-secondary)',
  opacity: disabled ? 0.3 : 1,
  transition: 'background-color var(--duration-fast) var(--ease-smooth), color var(--duration-fast) var(--ease-smooth)',
})

// 词条导航条（v0.5.2 §6）：编辑区顶部、词条内容区之外的独立功能区，吸顶。
// 箭头是浏览器式前进 / 后退，走用户访问轨迹，不是词表顺序。
// 形态（v0.7.2）：通栏细行——贴滚动容器上缘、无圆角、下缘一道细线，底取标题栏档。
// 旧 V8 原型 .ed-toolbar 的「圆角描边浮条」已废（见下方 :84-94 的实现）。
// 二轮两处修正：
// ① **外层 wrapper 不可再垫水平内边距**——那道 borderBottom 画在本组件的盒内，wrapper
//   垫多少、分割线左右就各短多少，「顶不到屏幕边缘」就是这么来的（修复前的成因）。
//   故 WorkbenchNavBar 的左右内边距只留 14px（见下方 style 的 padding），wrapper 通栏不垫。
// ② 底色取 **--color-chrome**（spec §1.1 的标题栏 / 活动栏档，用户指定）。
export default function WorkbenchNavBar({
  region, location, onMoveWord, onDeleteWord, onBack, onMergeAdd, mergeCount = 0, mergeDisabled = false,
  familiarity, onFamiliarityChange, inLibrary = false, breadcrumb,
  editing, onSaveEdit, onCancelEdit,
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

  // V8 .nav-btn:hover：hover 起底色并转主色。
  // 底色取 **--color-surface-hover-recessed** 而非 --color-surface-hover（v0.7.2 二轮）：
  // 导航条底色已由内容面改取 --color-chrome（#EEECE5, L* 93.375），而共享的
  // --color-surface-hover（#F0F1EE, L* 94.996）压在 chrome 上只有 **1.62 L\***，
  // 跨不过本仓 2 L* 的可读门槛——hover 等于看不见。--color-surface-hover-recessed
  // （#FAF9F6, L* 97.925，离 chrome **4.55 L\***）正是 tokens.css 里为「凹陷面悬停」
  // 定义的那一档，chrome 就是凹陷档之一（tokens.css 自己按 L* 93–96 归的组）。
  // 这是**沿用既有 token**，没有新造色值（palette 归 Task 1、tokens.test.ts 钉着）。
  const hoverOn = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.currentTarget.disabled) return
    e.currentTarget.style.background = 'var(--color-surface-hover-recessed)'
    e.currentTarget.style.color = 'var(--color-text-primary)'
  }
  const hoverOff = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'transparent'
    e.currentTarget.style.color = 'var(--color-text-secondary)'
  }

  return (
    <div
      style={{
        // 通栏细行（v0.7.2）：贴滚动容器上缘、无圆角、下缘一道细线，底取标题栏档。
        // 那条 borderBottom 在本组件盒内，故**左右内边距归 wrapper 管、这里只管内容**：
        // wrapper 通栏不垫（见文件头二轮 ①），这条线才顶得到屏幕左右边缘。
        position: 'sticky', top: 0, zIndex: 'var(--z-sticky)',
        minHeight: `${NAV_HEIGHT}px`, display: 'flex', alignItems: 'center', gap: '10px',
        padding: '0 14px',
        background: 'var(--color-chrome)',
        borderBottom: '1px solid var(--color-border)',
        marginBottom: 0,
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
      {/* 返回页面包屑（v0.7.2 §8.3）：返回箭头之后、右端动作簇之前，是导航条上唯一的浮动文字。 */}
      {region === 'dict' && breadcrumb && (
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{breadcrumb}</span>
      )}
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
      {/* 移入 / 移回（v0.7.5 Task 11）：左簇、前进箭头右侧、面包屑与右端簇之前。
          只在工作台、且调用方传了当前模块与回调时渲染——WordWorkbench 只会在选中词存在时
          渲染本导航条，故「没有选中词就没有这枚按钮」由调用点保证。
          文案跟随**当前模块**：工作台是「移入储藏库」，储藏库是「移回工作台」。 */}
      {region === 'workbench' && location && onMoveWord && (
        <SquareButton size="nav" tone="canvas" onClick={onMoveWord}>
          {moveActionLabel(location)}
        </SquareButton>
      )}

      {/* ⋯ 更多操作（普通模式可见）本轮不实现：⋯ 菜单内容与「删除此标签页」收进菜单是 v0.7.0 段二的独立项，
          本轮没有可放入 ⋯ 的条目；等段二落地时在本组件右侧补上即可。
          ＋ 新增标签页已移除：它与标签条右侧的 ＋ 重复（同一 TAB_GROUPS 选择器），标签条那处保留为唯一入口。 */}
      {/* 右端簇自带 flexWrap:'wrap'：窄窗口下这一簇被压到放不下时在簇内重排，而不是先溢出
          （缺省的 nowrap 会溢出）。导航条高由 min-height 撑——簇长高时条跟着长高，故不写死
          height。justifyContent:'flex-end' 让重排出来的行仍靠右对齐，不至于左边缘不齐。
          簇与其内的锚点 div 都不设底色，按钮脚下就是本条自己的底（见下方导航条容器的
          background），故簇内 SquareButton 一律取 tone="canvas"（规则：tone 随直接父级底
          选套，透明父级不算、再往上看一层——「脚下说了算」）。v0.7.2 二轮：脚下由
          --color-surface 改成 --color-chrome，两者都不是纯白，故 tone 由 "surface" 改
          "canvas"——surface 套的 rest/hover（#E8E4DE → #F5F3ED）只在纯白底上拉得出阶差，
          压在 chrome 上 rest 与底只有 0.13 L*、hover 也只有 2.47 L*，都糊。 */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {region === 'workbench' ? (
          <>
            {/* 编辑中的保存 / 取消（v0.7.4 任务 14）：行内那对「保存 / 取消」整个搬到导航条——
                行内留着它们，编辑盒子就退不回行内级（块级盒子跟在 `·` 后会强制断行，
                单位跳到第二行），「进编辑零位移」也就无从谈起。两枚按钮**常驻占位**：
                `editing` 有值才出现，一次编辑全程都在，不做 hover 显隐。
                `dirty` 本版只作将来的「未保存」提示，不据此禁用按钮。 */}
            {editing && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {/* 可选 prop 用 `?.()`：`editing` 有值而回调没传时是「看得见、点不动作」的哑控件。 */}
                <SquareButton size="nav" tone="canvas" onClick={() => onSaveEdit?.()}>保存</SquareButton>
                <SquareButton size="nav" tone="canvas" onClick={() => onCancelEdit?.()}>取消</SquareButton>
              </span>
            )}
            {/* 编者模式（v0.5.3 §4.1 第 16 条重做）：形态开关，开 = 浅品牌蓝底 + 深字、关 = 暖中性底，
                两态只差底色，几何完全一致，故切换时导航条不跳动。role="switch" + aria-checked
                保留语义（不用 aria-pressed：它与 aria-checked 语义重复且优先级不明）。
                hover 与按压回弹由 SquareButton 内部处理，这里不再手写 onMouse*。
                不加 title：accname 2.2 里 title 早于 name-from-content，会把可及名钉成常量，
                而这里的状态由 aria-checked 播报、可见文字「编者」本身已够指名。 */}
            <SquareButton
              size="nav"
              tone="canvas"
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
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover-recessed)'; e.currentTarget.style.color = 'var(--color-danger)' }}
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
            {/* 已选读数（v0.7.3 §8.2）：从按钮文案里拆出来单独放，**常驻占位**——
                不占位的话勾选第一项时两颗按钮会左右跳。 */}
            <span style={{
              fontSize: '11px', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap',
              visibility: mergeCount > 0 ? 'visible' : 'hidden',
            }}>
              已选 <span className="stat-num">{mergeCount}</span> 项
            </span>
            <div ref={anchorRef} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {/* 「＋」＝原「合并添加 · N 项」：行为逐字不变（不传 categoryId，合并后落默认分类）。
                  Tooltip 包裹而非 title 的理由照旧（accname 2.2）。 */}
              <Tooltip content={mergeCount > 0 ? `把已选的 ${mergeCount} 项添加进词条` : '先勾选要添加的词条'} width={260}>
                <SquareButton size="nav" tone="canvas" aria-label="添加已选词条"
                  disabled={mergeDisabled} onClick={() => onMergeAdd?.()}>
                  <Icon name="plus" size={12} />
                </SquareButton>
              </Tooltip>
              {/* 「添加至…」＝原「＋（选择分类后添加）」：仍开 CategoryPickerPopover，
                  只是把「这是个要选目的地的动作」写进文案。 */}
              <SquareButton
                size="nav"
                tone="canvas"
                aria-label="添加至指定分类"
                disabled={mergeDisabled}
                onClick={() => setPickerOpen(o => !o)}
              >
                添加至…
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
