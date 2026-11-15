import { useState, useEffect, useCallback, useLayoutEffect, useImperativeHandle, forwardRef, useRef, type CSSProperties, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useWordStore } from '../../stores/wordStore'
import { useViewStore } from '../../stores/viewStore'
import { getDefinitions } from '../../services/fieldService'
import { sortTreeByTemplate, ALLOWED_CHILD_KEYS } from '../../lib/fieldOrder'
import { visibleTabs, defaultTab, missingTabs, groupRootsByTab, addableLeafKeys, isGroupedTab, TAB_GROUPS, type TabKey } from '../../lib/tabs'
import { hasFieldChanges } from '../../lib/fieldChanges'
import { insertBefore, dropY, reorderSiblingIds } from '../../lib/dragReorder'
import { selectWordRootItems } from '../../lib/phonetic'
import { fieldState, containerState, unitState, type FieldState } from '../../lib/fieldState'
import EmptyState from '../ui/EmptyState'
import Tooltip from '../ui/Tooltip'
import WordMasteryTooltip from '../ui/WordMasteryTooltip'
import LeechBadge from '../ui/LeechBadge'
import ContextMenu, { type MenuItem } from '../ui/ContextMenu'
import Icon from '../icons'
import CategoryCapsule from './CategoryCapsule'
import DragGhost from './DragGhost'
import PhoneticArea from './PhoneticArea'
import BacklinksFootnote from './BacklinksFootnote'
import TabBar from './TabBar'
import WorkbenchNavBar from './WorkbenchNavBar'
import EntryBand from '../entry/EntryBand'
import SenseFlow from '../entry/SenseFlow'
import type { SenseGroup } from '../entry/SenseFlow'
import FlowRow from '../entry/FlowRow'
import LeafFlow from '../entry/LeafFlow'
import { DashMark } from '../entry/Mark'
import EditableValue from '../entry/EditableValue'
import LinkedText from '../entry/LinkedText'
import { isLeafFlow } from '../../lib/leafFlow'
import { leafForm, rowTitle } from '../../lib/fieldKind'
import { FIELD_LABEL_STYLE } from '../../lib/labelStyle'
import RowActions, { rowIconStyle } from '../entry/RowActions'
import AddMenu, { menuItemStyle, menuItemHover, type AddItem } from '../entry/AddMenu'
import { useCategoryStore } from '../../stores/categoryStore'
import { useReviewOverlayStore } from '../../stores/reviewOverlayStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { isLeech, leechTooltip } from '../../lib/review/leech'
import { measureTextWidth, MEASURE_STYLE, MEASURE_INPUT_CLASS, MEASURE_MIN_WIDTH, measureMarkSlot } from '../../lib/measureText'
import { editKeyDown } from '../../lib/editKeyDown'
import { linkableField, stripLinks, validateLinks, linkErrorText, type LinkToken } from '../../lib/links'
import { useLinkJump } from '../../lib/linkJump'
import { isWordInLibrary } from '../../lib/ensureWord'
import { masteryBlocks, MASTERY_COLORS } from '../../lib/review/masteryScale'
import { familiarityFromValue, displayTier } from '../../lib/review/mastery'
import { useUiStore } from '../../stores/uiStore'
import { moveConfirmRequest, moveTarget } from '../../lib/archiveMove'
import { deleteWordConfirmRequest } from '../../lib/wordActions'
import { ENTRY_BAND_WIDTH, ENTRY_COLUMN_PADDING_X, ENTRY_PHONETIC_GAP, NAV_CONTROL_HEIGHT } from '../../lib/layout'
import { mobileRowActionsVisible } from '../../lib/mobileRowActions'
import { hitAreaStyle, TOUCH_LONG_PRESS_MS, TOUCH_SLOP_PX, TOUCH_TARGET_PX } from '../../lib/mobileHitArea'
import { rowSheetItems, unitSheetItems, addChildSheetItems, pageAddSheetItems, SHEET_ADD_TAB_PREFIX, SHEET_ADD_WORD_ROOT, SHEET_ADD_PHONETIC, type SheetItem } from '../../lib/mobileSheets'
import { useTouchLongPress } from '../../lib/useTouchLongPress'
import MobileActionSheet from '../layout/mobile/MobileActionSheet'
import type { FieldDefinition, FieldValue } from '../../types/field'

/**
 * 一行的来源态取色（v0.7.3：四态，取代 v0.7.2 的三态）。
 *
 * 普通模式一律 `'none'`（不出条）：来源态是**编者视角**的信息，普通模式下并排显示会让同一个
 * 词条里的各行颜色不一致，读起来像两种东西。编者模式才按来源现形——与 `SourceBar` 同判据。
 * 词性窗格（`isPosPane`）永远 `'none'`：它是词性→释义树的结构节点，不参与来源态
 * （旧 `fieldPaneLeftBar` 的这条不变量原样保留）。
 *
 * v0.7.3 起「有没有条」由 `'none'` 承担，不再由 `'original'` 兼任：旧版返 `'original'`
 * 是因为 original 不出条；现在 original 要出默认色的条，两者必须分开。
 */
export function rowSourceState(editorMode: boolean, isPosPane: boolean, fv: FieldValue): FieldState {
  if (!editorMode || isPosPane) return 'none'
  return fieldState(fv)
}

// 左端 gutter 宽度（v0.5.2 修订）：手柄宽 10px，不额外留余量。
// 宽度写死的意义是「手柄显隐不改变文字区宽度」→ 零重排。
const GUTTER_WIDTH = 10
/** 行内 gutter 与内容之间的 gap（FieldCard 的 content wrapper 用它）。 */
const GUTTER_GAP = 4
/** 手柄按钮的高度（FieldCard 的 grip）：44dp 命中层要以它为中心上下各让一半。 */
const GRIP_HEIGHT = 14
/** run-in 头（groupHead）里手柄与标题之间的 gap：命中层右缘按它收回正文起点前 1px。 */
const GROUP_HEAD_GAP = 10

/** 多列块（LeafFlow）的左缘 = 所属容器**标题文字**的左缘（v0.7.4 决定五 5.1）。
 *  容器行走的是 FlowRow：左内边距 11 + 手柄槽 10 + 行内 gap 4，标题文字因此落在 25px。
 *  LeafFlow 的默认 11 是按「标题在 11」写的，实际会让第一个 `·` 比标题向左凸出 14px
 *  （用户实测报的就是这一处）。`inset` 取这个组合值，`·` 与标题同缘。 */
const LEAF_FLOW_INSET = 11 + GUTTER_WIDTH + GUTTER_GAP

/**
 * 分条标记（`·` / `–`）的取色表（v0.7.4 决定九）：三态各一个来源色 token，**不新增色值**。
 *
 * 标记是**画**出来的（`Mark.tsx`），故它们能取实心来源色——字体字形只有两三像素墨，
 * 涂色看不出差别（用户原话「横杠和小点分不清」）。决定九的强度表在这里取**全强度**：
 * 45% 稀释只针对左缘那根竖条（`SourceBar`），6px 的小圆点上 45% 会糊成一片灰。
 *
 * 表只有一份（模块级）：单位的小点与例句的横杠同源，两处不必各写一遍。
 * **取色门控在调用处**——普通模式一律 `'var(--ink-3)'`，否则阅读视图会长出一片彩点。
 */
const MARK_COLOR: Record<Exclude<FieldState, 'none'>, string> = {
  original: 'var(--color-weave-original)',
  edited: 'var(--color-weave-edited)',
  personal: 'var(--color-weave-personal)',
}

// 字段标签列宽度（v0.5.2 修订）：各层统一，不再分「第 0 层 100px / 更深层 80px 起」两档——
// 两档既让深层多丢宽度，又让「例句」这类二字标签空掉大半列。
const LABEL_COLUMN_WIDTH = 72

// 常驻占位 + opacity 显隐（照搬 PhoneticArea.tsx 的 reveal 模式）
// visibility 而非仅 opacity（v0.5.2 任务 6 回归修复）：常驻挂载后仅靠 opacity，
// 不可见控件仍在 Tab 序列与无障碍树中，Tab+Enter 会误触删除/加子词条；
// visibility:hidden 同时移出两者，且不占位差、布局照旧保留。
const reveal = (on: boolean): CSSProperties => ({
  opacity: on ? 1 : 0,
  visibility: on ? 'visible' : 'hidden',
  pointerEvents: on ? 'auto' : 'none',
  transition: 'opacity var(--duration-fast) var(--ease-smooth)',
})

// 容器字段（#5 键判定，取代「有子级且无值」推断：刚建的空容器立即按容器渲染）
const CONTAINER_FIELD_KEYS = ['part_of_speech', 'supplementary', 'phrase', 'exchange', 'derivatives', 'example_sentence', 'synonyms', 'word_root', 'synonym_discrimination', 'synonym_discrimination_group']

interface InsertIndicator {
  overId: string
  before: boolean
}

// 「＋ 添加」菜单的打开状态：页级一处、行级一处（同一时刻至多一个）
type AddMenuState = { target: 'page' } | { target: 'row'; id: string } | null

/**
 * 手机底部动作表的状态（v0.7.7 Task 5 / fix Important 3）。
 * - `row` / `unit`：行菜单与单位表，list 形态；
 * - `addChild`：行菜单「添加子项」的 grid 表，`containerId` 指向实际接收新子项的容器
 *   （叶子行带可加子类时是父节点，与桌面 `FieldCard` 的 `containerFv` 同一判据）；
 * - `pageAdd`：页级「＋ 添加」的 grid 表，无目标行（`id: null`，不触发目标高亮）。
 */
type MobileSheetState = {
  kind: 'row' | 'unit' | 'addChild' | 'pageAdd'
  id: string | null
  title: string
  items: SheetItem[]
  mode?: 'list' | 'grid'
  containerId?: string
}

interface FieldCardCtx {
  defs: FieldDefinition[]
  editorMode: boolean
  /** 触摸语义（v0.7.7 手机 / v0.7.8 平板）：手机恒真、平板由 `touch` prop 独立开启。所有触摸
   *  分支只在它为真时生效，桌面逐像素不变（spec §6 不变量 1）。行尾簇的可见性读 `mobileRowActionsVisible`。 */
  touch: boolean
  /** 底部表当前指向的节点 id（v0.7.7 Task 5，spec §3.1）：该行出临时高亮，关表即清。 */
  sheetTargetId: string | null
  /** 打开行级底部表（v0.7.7 Task 5）：长按正文文字区（含容器标题）与手机 `⋯` 共用这一处。 */
  onOpenRowSheet: (fv: FieldValue) => void
  /** 打开流式单位的底部表（v0.7.7 Task 7）：长按单位正文，条目只有编辑 / 删除。 */
  onOpenUnitSheet: (containerFv: FieldValue, unit: FieldValue) => void
  editingId: string | null
  editValue: string
  insertIndicator: InsertIndicator | null
  /** 正在被拖动的节点 id（v0.7.4 任务 12 起是单位、任务 16 起也可能是行）：LeafFlow 的
   *  单位选中框与页面级的 `dragGhost` 副本解析都读它。 */
  activeDragId: string | null
  addMenu: AddMenuState
  onStartEdit: (fv: FieldValue) => void
  onEditValueChange: (value: string) => void
  onSave: () => void
  onCancelEdit: () => void
  onDelete: (fv: FieldValue) => void
  onToggleAddMenu: (fv: FieldValue) => void
  onPickAdd: (containerFv: FieldValue, def: FieldDefinition) => void
  hoveredId: string | null
  onHover: (id: string | null) => void
  /** 目标是否在库（v0.7.5 Task 3）：`LinkedText` 的失效态判据，调用方从 store 的 `libraryIndex` 派生。 */
  isInLibrary: (lemma: string) => boolean
  /** 链接点击（v0.7.5 Task 4 接管）：本任务只透传，渲染层不决定跳转。 */
  onJump: (token: LinkToken) => void
}

interface FieldCardProps extends FieldCardCtx {
  fv: FieldValue
  depth: number
  /** 该行的父节点（根级为 null）：行尾「＋」要加到**本行所在容器**，叶子行的容器即父节点。 */
  parentFv: FieldValue | null
  labelOverride?: string | null
  /** 义号（FlowRow 的左槽）：本页**一律不传**（工作区释义仍用 labelOverride 里的「(n)」）。
   *  v0.7.2 二轮起「不传」有了几何意义：FlowRow 的编号槽在 `no` 缺席时连 18px 宽度一并消失，
   *  于是 run-in 头（groupHead，无编号槽、直接排 grip）与子行（FlowRow 行）落在同一条
   *  21px 的左缘上——此前子行多吃 12(gap) + 18(占位槽) = 30px，就是「词性下的释义相对词形
   *  有缩进」的成因。将来若某行真要义号，给它就是，整列会一致地往右让。 */
  no?: number | string
  /**
   * true = 作 SenseFlow 组的 run-in 头渲染（仅主标签页的根容器用）：只出可交互的头行
   * （拖拽手柄 / 单击编辑 / 行尾操作簇 + 衬线斜体的标签与横线），**不出子行**——
   * 子行由组装配另作义项行。同一份拖拽 / hover / 编辑 / 菜单机制因此两种形态共用。
   */
  asGroupHead?: boolean
  /**
   * 这一行左缘色条该用什么来源态（v0.7.4 决定九：取**最近的可着色容器**的聚合态）。
   * 由父级在映射子项时给；**有子级的行自行聚合、忽略它**（见 FieldCard 体内的 myBarState），
   * 叶子行则用它——父级就是它最近的容器。缺席时退回 `unitState`。
   * 聚合在嵌套容器处止步（见 lib/fieldState.ts）：改例句只让例句块换色，不染上方释义行。
   */
  barState?: Exclude<FieldState, 'none'>
  /**
   * 本行是否是其所属段的首行 / 末行（v0.7.4 决定八：段 = 一条释义的整棵子树）。
   * 段首由父级标在释义行上；段末由「最后一个后代叶子」承载——父级在映射子项时，
   * 只让末位子项收口（段首行的末位子项必定收口，见 FieldCard 体内的传递式），
   * 其余子项一律 `false`。平铺标签页（行不在任何释义子树里）两值都给 `true`，
   * 即每行独立成段。
   */
  barFirst?: boolean
  barLast?: boolean
  /** 本行是否嵌在用户自建的容器里（决定九的继承优先）：为真时整棵子树取「用户创建」色。 */
  inheritedUser?: boolean
}

/**
 * 子行的 `labelOverride`（FieldCard 内部与 SenseFlow 的组装配共用一份，避免两处各写一遍）：
 * 词性子级编「中文释义(1)」/「英文释义(1)」；近义词辨析组用组描述作小标题；其余无 override。
 * `counters` 跨同级累计，故调用方每个父节点传一个。
 */
function childLabelOverride(
  parentKey: string, childKey: string, child: FieldValue, counters: { zh: number; en: number },
): string | null {
  if (parentKey === 'part_of_speech') {
    if (childKey === 'chinese_definition') { counters.zh += 1; return `中文释义(${counters.zh})` }
    if (childKey === 'english_definition') { counters.en += 1; return `英文释义(${counters.en})` }
    return null
  }
  if (childKey === 'synonym_discrimination_group') return child.value
  return null
}

/** 触摸命中区覆盖层相对 22px 按钮的偏移（v0.7.7 Task 4）：44 − 22 各让一半，覆盖层以按钮为中心。 */
const TOUCH_HIT_OFFSET = -(TOUCH_TARGET_PX - NAV_CONTROL_HEIGHT) / 2

/**
 * 词条头带右簇里分类胶囊与「＋」的视觉边长（v0.7.7 Task 10，spec §3.5）。
 * 两者的命中区都扩到 44dp：胶囊用 `verticalOnly`（横向会误中相邻胶囊），
 * 「＋」用默认 44×44、以按钮为中心——左右各溢 10px，恰好填满右簇的 10px 间距而不越界。
 */
const BAND_CONTROL_SIZE = 24
const BAND_HIT_OFFSET = -(TOUCH_TARGET_PX - BAND_CONTROL_SIZE) / 2

/**
 * 底部表指向的目标行的临时高亮（v0.7.7 Task 5，spec §3.1）。
 *
 * 与 `FlowRow` 的 `focused` 同一形态——内阴影描边 + 圆角 + 极浅品牌底；内阴影画在盒内侧、
 * 不进布局，故表开 / 关的那一刻行内一个像素都不动。底色刻意取 `--color-brand-softer`
 * （比 `focused` 的 `--color-brand-soft` 更浅一档）：`focused` 表示「正在编辑 / 拖动」，
 * 这里只是「表指向哪一行」的临时标记，两者可能同时出现在不同的行上。
 * 高亮的唯一依据是页面级的 `sheet.id`：长按成立即置位、关表即清，松手或取消后不留选中态。
 */
const SHEET_TARGET_STYLE: CSSProperties = {
  boxShadow: 'inset 0 0 0 1px var(--color-brand)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-brand-softer)',
}

/**
 * 流式单位的正文长按外壳（v0.7.7 Task 7，spec §3.4）。
 *
 * 单位在 `LeafFlow` 的 `items` 数组里逐个产出，而数组是在 `FieldCard` 的渲染体里 `.map` 出来的
 * ——**hook 不能写在 map 回调里**。故把「一个单位的长按」收成这个小而独立的组件：每个单位
 * 各自挂一份 `useTouchLongPress`，hook 数按单位数稳定，也与 `LeafFlow` 的哑组件边界无关
 * （LeafFlow 只渲染传进来的 `content`，不持任何状态）。
 *
 * 只在手机外壳挂载（`touch` 为真）；桌面走原样的 `renderUnitContent`，不新增任何包裹节点。
 * 手势与 `FieldCard` 正文那一份逐字同构：长按成立 → 震动 + 打开单位底部表；随后浏览器补发的
 * 那一次点击由一次性闸门吞掉（单位正文里有链接，表刚开就把词跳走同样是 bug）。
 * 编辑态不挂（调用点按正在编辑的单位 id 排除）：输入框里的长按属于系统选词 / 输入法。
 */
function UnitActivation({ onLongPress, children }: { onLongPress: () => void; children: ReactNode }) {
  const swallowClickRef = useRef(false)
  const { handlers } = useTouchLongPress(() => {
    swallowClickRef.current = true
    navigator.vibrate?.(10)
    onLongPress()
  })
  return (
    <span
      {...handlers}
      onPointerDownCapture={() => { swallowClickRef.current = false }}
      onClickCapture={(e: React.MouseEvent<HTMLElement>) => {
        if (!swallowClickRef.current) return
        swallowClickRef.current = false
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      {children}
    </span>
  )
}

/**
 * 行尾「⋯」菜单（v0.7.2）：两枚 22px 方钮里的第二枚。`RowActions` 出两套形态——编者模式
 * （`mode="edit"`）是 `＋` 与垃圾桶、不出 `menu`；普通模式（`mode="view"`）只出这一个 `menu` 槽，
 * 故这里自带 `⋯` 触发器，点开走现成的 `ContextMenu`（fixed 落位，点外 / Esc 自关）。
 * v0.7.3：普通模式的**所有**动作并进这一份菜单。
 * v0.7.4 决定三：行级只删不加——菜单收成「编辑 / 添加子项 / 删除」，「添加同级」全站撤掉。
 *
 * v0.7.7 Task 4（spec §3.2）：手机上这枚 `⋯` 是**唯一**保留的行尾控件，视觉仍是 22px，
 * 命中区以绝对定位覆盖层扩到 44×44、**不参与布局**（不能改变行的可用宽度与折行点）。
 * 覆盖层挂在**按钮内部**（`position: relative` + 一个 `aria-hidden` 的绝对定位 span）：
 * 它因此是按钮的 DOM 后代，点在任何一寸扩出来的区域上都是点这枚按钮——`onClick` 等监听
 * 仍只挂在原按钮上，覆盖层自己不带任何手势。覆盖层不传 `touch` 的调用点（单位行尾槽）
 * 不渲染，桌面逐像素不变。
 *
 * v0.7.7 Task 5（spec §3.2）：`onOpen` 有值时手机上**不再渲染桌面 `ContextMenu`**——点按
 * 直接交给它（打开与长按同一张底部表）。桌面不传 `onOpen`，原 `ContextMenu` 路径逐字保留。
 */
function RowMenu({ items, touch = false, onOpen }: { items: MenuItem[]; touch?: boolean; onOpen?: () => void }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  return (
    <>
      <button
        type="button"
        title="更多操作"
        aria-label="更多操作"
        onClick={e => {
          if (onOpen) { onOpen(); return }
          setPos({ x: e.clientX, y: e.clientY })
        }}
        style={touch ? { ...rowIconStyle, position: 'relative' } : rowIconStyle}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text-primary)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'inherit' }}
      >
        {touch && (
          // 44×44 命中区（v0.7.7 Task 4）：绝对定位、不进布局；挂在按钮内部，点击事件冒泡回
          // 本按钮的原 onClick——监听不搬家。`aria-hidden`：语义仍由按钮的 aria-label 承担。
          <span aria-hidden="true" style={{ ...hitAreaStyle(), top: TOUCH_HIT_OFFSET, left: TOUCH_HIT_OFFSET }} />
        )}
        <Icon name="more" size={16} />
      </button>
      {!onOpen && pos && <ContextMenu x={pos.x} y={pos.y} items={items} onClose={() => setPos(null)} />}
    </>
  )
}

// 就地编辑的两件共用机制（v0.7.4 任务 14）：**保存 / 取消已搬到导航条**（WorkbenchNavBar），
// 行内只剩输入框本身，故编辑盒子可以退成行内级、进编辑时周围一个像素不动。
// 输入框的**起宽**量的是被替换内容的渲染宽度（`lib/measureText.ts`，四处消费点共用一份），
// 键盘在 `lib/editKeyDown.ts`（纯函数，可直接单测）。
// 例句（`example`）编辑态的字号（**唯一出处**）：画上去的 `DashMark` 按 em 取值，量它的探针
// 取 `font.fontSize`，两者必须同为 **14px**（被替换的非编辑行也是 14px）。差一档就是
// 「量出来 11.2px、画上去 10.4px」——进编辑留 0.8px 的残差位移。故这一支的 wrapper 与
// 输入框的 `font` 两处同取这个常量，不各写一份数字。
const EXAMPLE_EDIT_FONT_SIZE = 14

// 单行编辑框：从**被替换内容**的宽度起、随输入增长。字体由调用处按该行给——例句（`example`）
// 是衬线斜体 14px、行首还有一枚 `DashMark`（见值格的非编辑分支），两样都要算进去，
// 否则进编辑那一刻既换了字体、又丢了那枚 `–`，整行当场往左跳。
function MeasuredInput({ value, font, mark, onChange, onKeyDown }: {
  value: string
  font: CSSProperties
  /** 被替换内容里、输入框**之前**那部分（例句的行首 `–`）；其余行不传。 */
  mark?: ReactNode
  onChange: (v: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  const probeRef = useRef<HTMLSpanElement>(null)
  const [textWidth, setTextWidth] = useState(0)
  useLayoutEffect(() => { setTextWidth(measureTextWidth(probeRef.current)) }, [value])
  return (
    <>
      <span ref={probeRef} aria-hidden="true" className={MEASURE_INPUT_CLASS} style={{ ...MEASURE_STYLE, ...font }}>{mark}{value}</span>
      <input
        className={MEASURE_INPUT_CLASS}
        style={{ ...font, minWidth: MEASURE_MIN_WIDTH, ...(textWidth ? { width: textWidth } : null),
                 border: '1px solid var(--color-brand)', color: 'var(--color-text-primary)', background: 'var(--color-surface)' }}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        autoFocus
      />
    </>
  )
}

// 单个字段行（v0.7.2 改用原语外壳）：grip 拖拽（仅 grip 激活拖拽）+ 同级插入指示线 + 行尾操作簇。
// 旧代码里「卡片容器 + 左条 + 三态徽章 + 角落控件」的四层圆角嵌套，换成 FlowRow + SourceBar + RowActions。
// v0.7.3：行尾那枚 6px 方点（SourceMark）整个退场，来源只剩左缘那根条（SourceBar，由 FlowRow / LeafFlow 渲染）。
function FieldCard({ fv, depth, parentFv, labelOverride, no, asGroupHead = false, barState, barFirst = true, barLast = true, inheritedUser = false, ...ctx }: FieldCardProps) {
  const {
    defs, editorMode, touch, sheetTargetId, onOpenRowSheet, onOpenUnitSheet, editingId, editValue, insertIndicator, activeDragId, addMenu,
    onStartEdit, onEditValueChange, onSave, onCancelEdit, onDelete,
    onToggleAddMenu, onPickAdd, hoveredId, onHover, isInLibrary, onJump,
  } = ctx
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: fv.id })
  const { setNodeRef: setDropRef } = useDroppable({ id: `drop-${fv.id}` })
  const setRefs = useCallback((node: HTMLElement | null) => {
    setNodeRef(node)
    setDropRef(node)
  }, [setNodeRef, setDropRef])

  // ── 手机长按正文（v0.7.7 Task 5，spec §3.1）─────────────────────────────────────
  // 长按成立 → 目标行临时高亮（页面级 `sheet.id` 驱动）+ 10ms 震动 + 打开行级底部表。
  // `disabled: !touch` 是桌面分支的唯一门：hook 完全惰性（不起计时器、不拦 contextmenu），
  // 右键菜单与桌面既有行为逐字保留。hook 必须在 `if (!def) return null` **之前**调用，
  // 否则定义尚未加载的那一帧会少走一个 hook（React #310 的同一条理由）。
  //
  // 长按后手指抬起时浏览器仍会补发一次 click（触屏合成事件）。若正文里有链接，那一下会在
  // 表刚打开时把词跳走。故长按成立时置位一个一次性闸门，同一元素上的 click 捕获阶段把紧随
  // 其后的那一次吞掉；下一次 pointerdown 先复位——正常点击（下一轮）不受影响。
  const swallowClickRef = useRef(false)
  const { handlers: longPressHandlers } = useTouchLongPress(() => {
    swallowClickRef.current = true
    // 不支持的 WebView（含部分桌面内嵌环境）没有 vibrate，可选调用即静默跳过。
    navigator.vibrate?.(10)
    onOpenRowSheet(fv)
  }, { disabled: !touch })
  const longPressProps = {
    ...longPressHandlers,
    onPointerDownCapture: () => { swallowClickRef.current = false },
    onClickCapture: (e: React.MouseEvent<HTMLElement>) => {
      if (!swallowClickRef.current) return
      swallowClickRef.current = false
      e.preventDefault()
      e.stopPropagation()
    },
  }

  const def = defs.find(d => d.id === fv.fieldId)
  if (!def) return null

  const hasChildren = !!(fv.children && fv.children.length > 0)
  const isContainer = CONTAINER_FIELD_KEYS.includes(def.key)
  // 标签列文本（#4）：项类型字段不渲染字段名，值占满整行；词性子级用 override（先行，优先于它）。
  // 「这一行该印什么」的唯一出处是 lib/fieldKind 的 rowTitle——辨析组印组描述，不印字段名。
  const labelText = labelOverride ?? rowTitle(def.key, fv.value, def.name)
  const isPosPane = def.key === 'part_of_speech'
  const isGroupPane = def.key === 'synonym_discrimination_group'
  const isEditing = editingId === fv.id
  // 选中框（v0.7.3 §7.3）的**唯一**来源：本行正在编辑或正在被拖动。拖动中的行 id 只存在于
  // DndContext 的事件里、文件里没有对应 state（控制器裁决 P3），故用 useDraggable 自带的
  // `isDragging` 就地判定——`focused = isEditing || isDragging`，不新增组件 state、不接 DndContext。
  // 只在**这一行**亮（父行不亮），蓝＝「正在编辑」的状态，符合蓝色收窄规则第 1 条。
  const isFocused = isEditing || isDragging
  // 底部表打开期间目标行的临时高亮（v0.7.7 Task 5，spec §3.1）：依据是页面级的 `sheet.id`，
  // 关表即清。与 `focused` 同一形态、底色更浅一档（见模块级的 SHEET_TARGET_STYLE）。
  const isSheetTarget = sheetTargetId === fv.id
  const isPhonetic = def.key === 'phonetic'
  // 叶子走哪套排版由 lib/fieldKind 的 leafForm 唯一判定（与返回页同一函数）；
  // 表内键回落 'plain'（普通正文）。
  const form = leafForm(def.key)
  // 释义（中/英）是**分段的根**：它永远自己聚合，不取父级（词性根容器）的颜色——否则一条
  // 没有子级的干净释义会被同词性里**别的**释义的改动染成 edited，兄弟的任何脏都不该漏进来。
  const isDefinition = def.key === 'chinese_definition' || def.key === 'english_definition'
  // 最近的可着色容器的聚合态（v0.7.4 决定九）：释义（段根）与**有子级的行**都自己算；
  // 只有真正的叶子行才用父级给的 `barState`（父级即它最近的容器），两者都缺席时退回自己的单位态。
  // 聚合**在嵌套容器处止步**（修复轮，见 lib/fieldState.ts 的 containerState）：改一个例句只让
  // 例句块整段变 edited，上方「英文释义」行仍按自己的状态着色。
  const myBarState = hasChildren || isDefinition ? containerState(fv, inheritedUser) : undefined
  const selfBarState = myBarState ?? barState ?? unitState(fv, inheritedUser)
  // 来源色只在编者模式现形（与 rowSourceState 同一门控），词性窗格永不出条。
  // 走的是「这一行的色条该用什么态」而不是「这个节点自己是什么态」——决定九要求
  // 整段/整容器同色，叶子行因此取最近容器的聚合态，而不是自己的 fieldState。
  const gated = rowSourceState(editorMode, isPosPane, fv)
  const rowState: FieldState = gated === 'none' ? 'none' : selfBarState
  // 分段首末（决定八）：有子级的行自己的条不能在下面收口（它后面还有行），而是把
  // 「末行」交给最后一个子项 / 整块 LeafFlow。平铺标签页父级同时给 first/last，
  // 每行独立成段，子项也照此继承（perRowBar）。
  const perRowBar = barFirst && barLast && hasChildren
  const ownFirst = barFirst
  const ownLast = hasChildren ? perRowBar : barLast

  const posChildren = fv.children ?? []
  const childKey = (c: FieldValue) => defs.find(d => d.id === c.fieldId)?.key ?? ''
  const zhCount = posChildren.filter(c => childKey(c) === 'chinese_definition').length
  const enCount = posChildren.filter(c => childKey(c) === 'english_definition').length

  // 行尾「＋」加到**本行所在容器**：容器行即自身；能带子字段的行也取自身；纯叶子行才取父节点。
  // 「能带子字段」不能只看 CONTAINER_FIELD_KEYS——释义（chinese_definition / english_definition）
  // 不在那张表里，但 ALLOWED_CHILD_KEYS 给了它们子类型（例句 / 使用场景 / 近义词）。
  // 若只认容器表，刚建的空释义（isContainer=false）会把 containerFv 落到词性窗格，
  // 行尾 ＋ 就变成「再加一条释义」，该释义的第一个子项永远加不上去（有子项后 bug 才消失）。
  const rowHasAllowedChildren = (ALLOWED_CHILD_KEYS[def.key] ?? []).length > 0
  const containerFv = isContainer || rowHasAllowedChildren ? fv : parentFv
  const containerDef = containerFv ? defs.find(d => d.id === containerFv.fieldId) : undefined
  const containerChildDefs = containerDef ? defs.filter(d => (ALLOWED_CHILD_KEYS[containerDef.key] ?? []).includes(d.key)) : []
  const containerLabel = containerDef ? containerDef.name : ''

  // ③ hover 作用域（v0.7.2 二轮）：某行按钮可见 ⇔ hovered 节点是该行自身或其任一后代
  //（即「当前行 + 其祖先链」）——用户原话「只显示鼠标范围内的词条以及其父词条」。
  // **编者模式不再恒可见**：用户明确「工作区隐藏模式编者模式同理」，故两个模式同一判据，
  // 两处 RowActions 调用点（groupHead 与 FlowRow 的两处 `<RowActions visible={showsButtons}`）一致。
  const containsId = (node: FieldValue, id: string | null): boolean => {
    if (!id) return false
    if (node.id === id) return true
    return (node.children ?? []).some(c => containsId(c, id))
  }
  const showsButtons = containsId(fv, hoveredId)
  // v0.7.7 Task 4（spec §3.2 / §6.3）：手机只给「有子项的顶层行」留一枚常显的 ⋯，
  // 其余行**根本不渲染**行尾簇（返回 null，而不是渲染后隐藏）。桌面仍走 hover 判据，
  // 且**总是渲染**——「常驻占位、只改 opacity」的不变量只约束桌面。
  const mobileActions = mobileRowActionsVisible(depth, hasChildren)
  const hideRowActions = touch && !mobileActions
  const rowActionsVisible = touch ? mobileActions : showsButtons
  // v0.7.4 任务 16：被拖行的原位留痕——内容变淡 + 极浅品牌底；跟手的那一份副本由 DragOverlay
  // 在页面级渲染（DragGhost）。**不再缩放**：副本已经在跟手，原位再缩放是双重反馈。
  // 只碰 opacity 与 background 两件「画」的属性：任何进布局的属性（边框 / 内边距）都会让行在
  // 开始拖动那一刻位移——与 focused 用内阴影是同一条理由（R46）。
  const draggingStyle = isDragging ? { opacity: 0.35, background: 'var(--color-brand-softer)' } : null

  // 拖拽手柄（左端 gutter）：FlowRow 行与 run-in 头共用。宽度固定 10px，手柄显隐不改变文字区宽度 → 零重排。
  //
  // 触摸命中层（v0.7.7 Task 6，spec §3.4 / Review Focus 2）：手机上拖拽靠长按手柄，而可见手柄只有
  // 10×14，手指按不中，故在 `touch` 时补一层绝对定位覆盖层。它与 `RowMenu` 的 44×44 同一做法——
  // 挂在**按钮内部**（按钮因此加 `position: relative`）：覆盖层是按钮的 DOM 后代，拖拽 listeners
  // 仍只在原按钮上，按在扩出来的任何一寸都等于按这枚按钮，监听不搬家。
  //
  // 横向几何：`left: -12` 越过手柄槽进到行的左留白；右缘停在**正文起点前 1px**——手柄与正文之间
  // 只隔一个 flex gap（FlowRow 行 4px / run-in 头 10px），故 `right` 取「−(gap − 1)」，绝不压住
  // 正文的长按区。`GUTTER_WIDTH` 不动，正文可用宽度与折行点逐像素不变。
  // **宽度必须显式交还 left/right**：left / right / width 三者同时给定时 CSS 视作 over-constrained、
  // LTR 下忽略 `right`，`hitAreaStyle()` 的 44px 宽会直接盖住正文长按区。
  // `visibility` / `pointerEvents` 必须显式写回：可见件由 `reveal(showsButtons)` 控显隐，手机无 hover
  // 时按钮是 `visibility: hidden` + `pointer-events: none`，覆盖层要跳出继承态才收得到手指
  //（两者都能由子元素覆写，事件仍沿 DOM 冒泡回按钮上的 listeners）。
  const gripContentGap = asGroupHead ? GROUP_HEAD_GAP : GUTTER_GAP
  const gripHitArea = touch ? (
    <span
      aria-hidden="true"
      style={{
        ...hitAreaStyle(),
        top: `${-(TOUCH_TARGET_PX - GRIP_HEIGHT) / 2}px`,
        left: '-12px',
        right: `${-(gripContentGap - 1)}px`,
        width: 'auto',
        visibility: 'visible',
        pointerEvents: 'auto',
        touchAction: 'none',
      }}
    />
  ) : null
  const grip = (
    <span style={{ width: GUTTER_WIDTH, flexShrink: 0, alignSelf: 'center', display: 'inline-flex', alignItems: 'center' }}>
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...listeners}
        {...attributes}
        // 手机上截住 `pointerdown` 的冒泡（v0.7.7 Task 6，spec §3.4）：手柄不在正文长按区里，
        // 这一下绝不能让文字区的 `useTouchLongPress` 看到（那会误弹行菜单）。dnd-kit 的
        // TouchSensor 激活器挂在 `onTouchStart` 上，不受影响；桌面 PointerSensor 的
        // `onPointerDown` 在 `listeners` 里，此分支只在 `touch` 时存在，桌面事件链逐字不变。
        {...(touch ? { onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => { e.stopPropagation() } } : null)}
        title="拖动排序"
        aria-label="拖动排序"
        style={{
          width: '10px', height: `${GRIP_HEIGHT}px`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', background: 'transparent', borderRadius: 'var(--radius-sm)',
          cursor: isDragging ? 'grabbing' : 'grab', color: 'var(--color-text-tertiary)',
          flexShrink: 0, alignSelf: 'center', touchAction: 'none', ...reveal(showsButtons),
          // 覆盖层的定位基准只在手机加；桌面样式对象逐字不变。
          ...(touch ? { position: 'relative' as const } : null),
        }}
      >
        {gripHitArea}
        <Icon name="grip" size={10} />
      </button>
    </span>
  )

  // 行尾菜单（v0.7.4 决定三）：**行级只删不加**。
  // 「添加同级」全站撤掉；「添加子项」只留给真正的容器——今天那个按钮标着「添加子项」，
  // 在叶子行上点它其实加的是同级（容器回落成 parentFv，ALLOWED_CHILD_KEYS 对叶子为空），
  // 而同一个行上「添加同级」走的是同一条路、结果逐字相同：两个按钮一个动作。
  const menuItems: MenuItem[] = [
    ...((!isContainer || isPosPane || isGroupPane)
      ? [{ key: 'edit', label: '编辑', onSelect: () => onStartEdit(fv) }]
      : []),
    ...(isContainer || rowHasAllowedChildren
      ? [{ key: 'addChild', label: '添加子项', onSelect: () => onToggleAddMenu(fv) }]
      : []),
    { key: 'delete', label: '删除', danger: true, onSelect: () => onDelete(fv) },
  ]

  // v0.7.3 尾段 §3.4（D17）：**单位自己的**行尾槽——近义词 / 词源相关词 / 词形变化这些短叶子
  // 容器里的每个单位，悬停时行尾出一枚 `⋯`（普通模式）或一枚 `✕`（编者模式）。
  // 与 `menuItems` 的分工：容器行那枚 `⋯` 管的是「这一行」（编辑 / 添加子项 / 删除），
  // 单位这枚只管「这一个单位」，故**只有「编辑」「删除」两条**（D17 已确认）——
  // 单位上既不设 `＋`（往容器里加一项的入口是**容器行**的 `＋`，与行菜单的「添加子项」同一个），
  // 也没有「添加同级」——该动作 v0.7.4 决定三已全站撤掉（同级本就是同一个容器里的下一个单位）。
  const unitMenuItems = (unit: FieldValue): MenuItem[] => [
    { key: 'edit', label: '编辑', onSelect: () => onStartEdit(unit) },
    { key: 'delete', label: '删除', danger: true, onSelect: () => onDelete(unit) },
  ]

  // 流式单位（近义词等）的就地与编辑态（v0.7.3 修补）：单位在短条目改流式多列（d4b1bf9）
  // 之后不再走 FieldCard，行内正文那一套整条丢了——既没有双击（普通模式）/ 单击（编者模式）
  // 的编辑触发器，也没有编辑态的输入框，于是 ⋯ 菜单里的「编辑」设了 editingId 也无处渲染。
  // 这里把行内正文的模板接回来：触发器用 EditableValue，编辑中就地长输入框。
  // v0.7.4 任务 14：**保存 / 取消整个搬到导航条**（WorkbenchNavBar），行内不再有它们——
  // 盒子因此退成**行内级**（`display: 'inline-flex'`）：块级盒子跟在行内的 `·` 之后会强制
  // 断行，正是「`·` 留在原位、单词跳到第二行」的成因。
  // 输入框宽度由 MeasuredInput 从**被替换文字的宽度**量出（原先写死 160px：比原词宽就把
  // 后继单位挤到下一列、比原词窄就露出一段空白，两种都算位移）。字体与单位 span 的
  // UNIT_SPAN 逐字相同（`--font-sans` / 15px；`--ink-2` 由父 span 继承，这里不重复给），
  // 量出来才与正文逐像素一致。
  // 单位恒为单行的项字段（`*_item`，fieldType 'text'），故不出 textarea——它没有多行形态
  // （例句容器不进 LeafFlow，见 lib/leafFlow），`editKeyDown` 对它的 Enter 一律判为保存。
  // `data-field-edit` 不可省：点外关闭的判据是「指针落在 `[data-field-edit]` 里就不管」，
  // 而那个属性挂在**被编辑的那张 FieldCard** 上——编辑单位时它是容器的子项，容器自己的
  // `editingId === fv.id` 为假、拿不到这个属性，于是用户一按进输入框（此刻还没有改动）
  // 就被判成「点在编辑行外」，编辑态当场关掉。故编辑中的单位自己带上它。
  const renderUnitContent = (ch: FieldValue) => {
    if (editingId === ch.id) {
      return (
        <span data-field-edit="true" style={{ display: 'inline-flex', alignItems: 'center' }}>
          <MeasuredInput
            value={editValue}
            font={{ fontFamily: 'var(--font-sans)', fontSize: '15px' }}
            onChange={onEditValueChange}
            onKeyDown={editKeyDown(def.fieldType, onSave, onCancelEdit)}
          />
        </span>
      )
    }
    return (
      <EditableValue editorMode={editorMode} touch={touch} onStartEdit={() => onStartEdit(ch)}>
        {/* 阅读态同样渲染链接（v0.7.5 Task 3）：单位是叶子项字段，fieldKey 取**子项自己的**
            key（`childKey`），结构字段由 `LinkedText` 内部按 `linkableField` 回落原文。 */}
        <LinkedText value={ch.value} fieldKey={childKey(ch)} isInLibrary={isInLibrary} onJump={onJump} />
      </EditableValue>
    )
  }

  // ②a：子项渲染（v0.7.2 缺陷 5/6 后不再分「终端 / 非终端」两档间距，也不再逐层缩进——
  // 两档都收成 marginTop:0，由 FlowRow 的悬挂缩进统一表达层级）。
  //
  // v0.7.3 §5.4：若全部子项都是短叶子（近义词 / 词源相关词 / 派生词 / 补充 / 词形变化），
  // 逐个 FieldCard 的「一行一条」改成 LeafFlow 的流式多列。v0.7.4 起判据只认容器 key
  //（在不在 LEAF_FLOW_CONTAINER_KEYS 里），子项形状与长度一律不参与。容器自身的行**原样不动**，
  // 只换子项的渲染方式。
  const childCounters = { zh: 0, en: 0 }
  const leafFlow = isLeafFlow(def.key)
  // 向下继承的「用户容器」标记：本行自己若是用户建的，整棵子树都取 personal（决定九）。
  const childInheritedUser = inheritedUser || fv.source === 'user'
  const renderedChildren = hasChildren && !leafFlow
    ? fv.children!.map((child, i) => (
        <FieldCard
          key={child.id} fv={child} depth={depth + 1} parentFv={fv}
          labelOverride={childLabelOverride(def.key, childKey(child), child, childCounters)}
          // 父级即最近的容器：叶子子项用它着色；有子级的子项会自行聚合，忽略它。
          barState={myBarState}
          // 分段（决定八）：段首只在释义行上；末位子项接住本行的收口标记，其余一律不收。
          // 段首行（释义）自己的条不能在下面收口，但它的最后一个后代必须收口——故
          // 「本行是段首」也算作把 barLast 交下去；平铺标签页的 perRowBar 则让每个子项
          // 都独立成段（都收口）。
          barFirst={perRowBar}
          barLast={perRowBar || (i === fv.children!.length - 1 && (barFirst || barLast))}
          inheritedUser={childInheritedUser}
          {...ctx}
        />
      ))
    : null

  // run-in 头（SenseFlow 的 `head`，仅主标签页的根容器走这里）：衬线斜体的词性标签（或字段名）
  // + 中/英计数 + 拉到右缘的长横线；窗格自己的手柄 / 单击编辑 / 行尾簇原样保留。
  // 词性窗格的头标签是**值**（`adj.`），不是字段名（`词性`）——后者会与每个义项行的 POS 标签重复。
  const headLabelStyle: CSSProperties = {
    fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '16px', fontWeight: 600, whiteSpace: 'nowrap',
  }
  const headCounts = isPosPane
    ? `中文 ${zhCount} · 英文 ${enCount}`
    : (hasChildren ? String(posChildren.length) : undefined)
  const groupHead = (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: `${GROUP_HEAD_GAP}px`, padding: '2px 0 2px 11px', lineHeight: '27px' }}>
      {grip}
      {isPosPane && isEditing ? (
        // v0.7.4 任务 14：行内不再有「保存 / 取消」（搬到导航条），盒子也不留 gap。
        // 宽度走**量宽**（R24 已由控制器推翻）：裸 `<input>` **不会**收缩到内容宽，它取浏览器
        // 默认的 `size=20`（≈170px），进编辑那一刻整行要往右让出 ~150px。字体取本行头标签的
        // `headLabelStyle`（衬线斜体 16px / 600），与被替换的 `adj.` 一致。
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          <MeasuredInput
            value={editValue}
            font={headLabelStyle}
            onChange={onEditValueChange}
            onKeyDown={editKeyDown(def.fieldType, onSave, onCancelEdit)}
          />
        </span>
      ) : isPosPane ? (
        <span
          // v0.7.7 Task 5：容器标题也归长按菜单（spec §3.1「含容器标题」）——手机上它是与
          // `⋯` 同一张表；桌面 hook 惰性，右键菜单与单击 / 双击编辑逐字不变。
          {...longPressProps}
          onClick={() => !touch && editorMode && onStartEdit(fv)}
          onDoubleClick={() => (touch || !editorMode) && onStartEdit(fv)}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStartEdit(fv) } }}
          title={editorMode ? '点击编辑词性标签' : '双击编辑词性标签'}
          style={{ ...headLabelStyle, cursor: 'pointer' }}
        >
          {fv.value}
        </span>
      ) : (
        <span
          // v0.7.7 Task 5 review Important 1：顶层**非词性**容器（补充…）走 groupHead，不渲染
          // content 的标签 span，也没有正文值 span——标题是它唯一的长按入口。空「补充」容器
          // 不满足 `depth===0 && hasChildren`、不渲染 `⋯`，若标题也不挂长按，手机上将完全
          // 无法删除 / 添加子项。只挂标题 span（不挂整个 groupHead：会与手柄拖拽、⋯ 点击重叠）。
          {...(isContainer && !isEditing ? longPressProps : {})}
          style={headLabelStyle}
        >
          {def.name}
        </span>
      )}
      {!isEditing && headCounts !== undefined && (
        <span className="stat-num" style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{headCounts}</span>
      )}
      <span style={{ flex: 1, borderTop: '1px solid var(--color-border)', transform: 'translateY(-3px)' }} />
      <span style={{ alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
        {hideRowActions ? null : (
          <RowActions
            visible={rowActionsVisible}
            mode={editorMode ? 'edit' : 'view'}
            touch={touch}
            onAdd={() => onToggleAddMenu(fv)}
            onDelete={() => onDelete(fv)}
            menu={<RowMenu items={menuItems} touch={touch} onOpen={touch ? () => onOpenRowSheet(fv) : undefined} />}
          />
        )}
      </span>
    </div>
  )

  // 正文内容槽：标签 / 值。词性窗格的内容（POS 标签 + 中英计数）改由 run-in 头承担
  // （词性窗格一律作组的头渲染，见 groupHead），故此处不再有词性分支。
  const content = (
    <>
      {labelText && (
        <span
          // v0.7.7 Task 5：容器标题（近义词 / 补充 / 辨析组…）挂同一套长按——嵌套容器没有 `⋯`，
          // 标题长按是它唯一的行菜单入口（spec §3.1 Review Focus 1）。非容器行的标签只是字段名，
          // 不挂（正文文字区才是长按区）。编辑态（辨析组标题的输入框）不挂，见 `!isEditing`。
          {...(isContainer && !isEditing ? longPressProps : {})}
          // 编辑态时整组手势让位：输入框是本 span 的 DOM 子节点。键盘的 `e.target !== e.currentTarget`
          // 守卫在编辑态尤其要紧——键是从输入框冒泡上来的，不拦住就会把「Enter」当成「进编辑」。
          // （点击那条让位是历史遗留：v0.7.4 任务 14 之前行内还有那对不阻断冒泡的「保存 / 取消」，
          // 点「取消」会先 setEditingId(null)、再被冒泡上来的这次点击拉回编辑态并把输入回滚成
          // 已存值，按钮看上去完全失灵；按钮搬走后它已无对应物，但形态无害、故一并保留。）
          onClick={!touch && isGroupPane && !isEditing ? () => onStartEdit(fv) : undefined}
          onDoubleClick={isGroupPane && !isEditing ? () => onStartEdit(fv) : undefined}
          role={isGroupPane && !isEditing ? 'button' : undefined}
          tabIndex={isGroupPane && !isEditing ? 0 : undefined}
          onKeyDown={isGroupPane ? e => {
            if (e.target !== e.currentTarget) return
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStartEdit(fv) }
          } : undefined}
          title={isGroupPane ? (editorMode ? '点击编辑辨析组标题' : '双击编辑辨析组标题') : undefined}
          style={{
            ...FIELD_LABEL_STYLE,
            minWidth: LABEL_COLUMN_WIDTH, flexShrink: 0,
            cursor: isGroupPane ? 'pointer' : undefined,
          }}
        >
          {isGroupPane && isEditing ? (
            // 容器分支不渲染值格，但组标题带描述值：编辑态必须就地长出输入框。
            // v0.7.4 任务 14：行内不再有「保存 / 取消」（搬到导航条），故盒子不留 gap；
            // 宽度走**量宽**（R24 已由控制器推翻）：裸 `<input>` 取浏览器默认 `size=20`
            // （≈170px），比组描述长得多，进编辑那一刻整行要往右让出一截。字体取**本 span**
            // 的 C1 字形（FIELD_LABEL_STYLE：10.5px / 600 / 字距 0.1em），与被替换的组描述一致。
            // 一级 / 二级不再分字号——层级由缩进与固定 72px 标签列承担，字形统一为 C1。
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              <MeasuredInput
                value={editValue}
                font={{
                  fontFamily: FIELD_LABEL_STYLE.fontFamily,
                  fontSize: FIELD_LABEL_STYLE.fontSize,
                  fontWeight: FIELD_LABEL_STYLE.fontWeight,
                  letterSpacing: FIELD_LABEL_STYLE.letterSpacing,
                }}
                onChange={onEditValueChange}
                onKeyDown={editKeyDown(def.fieldType, onSave, onCancelEdit)}
              />
            </span>
          ) : (
            labelText
          )}
        </span>
      )}
      {!isContainer && (
        <span
          style={{
            flex: 1, minWidth: 0,
            fontSize: 'var(--text-sm)',
            // 行高取整（修复轮）：13px × 1.6 = 20.8px，多行释义会让后续每一行都落在小数像素上，
            // 例句的 1.82px 横杠在不同纵向位置被抗锯齿摊成不同粗细。21px 是整数值，观感不变。
            lineHeight: '21px',
            // 两模式同色（修复轮）：v0.7.2 起这里曾让编者模式下 original 值取次级墨，
            // 用户实测读作「打开编者模式中文变浅、行距收紧」。编者模式只该让**控件**现形，
            // 文字外观必须与普通模式逐像素一致。
            color: 'var(--color-text-primary)',
            fontFamily: isPhonetic ? 'var(--font-phonetic)' : undefined,
          }}
        >
          {isEditing ? (
            // v0.7.4 任务 14：行内不再有「保存 / 取消」（搬到导航条），wrapper 的
            // column/gap 一并去掉——两档按字段形态分流：
            //   · 多行（`fieldType === 'multiline'`）：**仍是块级满宽** column。它的 textarea
            //     用 `w-full`，而 `width:100%` 只有在一个有确定宽度的块级包含块里才有定义；
            //     换成 inline-flex 的收缩宽度会让百分比落进循环定义，宽度当场塌掉。
            //   · 单行：**inline-flex**，宽度由 MeasuredInput 从被替换文字量出。
            //     本行的文字格是 `flex:1`（占满行宽），写死 `w-full` 会把整行占满——进编辑
            //     时行尾的 `⋯` 与折行点一起跳，「周围一个像素不动」就无从谈起。
            def.fieldType === 'multiline' ? (
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <textarea
                  className="w-full px-3 py-2 rounded text-sm resize-none min-h-[60px]"
                  style={{ border: '1px solid var(--color-brand)', color: 'var(--color-text-primary)', background: 'var(--color-surface)' }}
                  value={editValue}
                  onChange={e => onEditValueChange(e.target.value)}
                  onKeyDown={editKeyDown(def.fieldType, onSave, onCancelEdit)}
                  autoFocus
                />
              </span>
            ) : (
              <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: `${EXAMPLE_EDIT_FONT_SIZE}px` }}>
                {/* 例句（`example`）在非编辑分支里是「行首一枚 `DashMark`＋8px 右间距 ＋ 衬线斜体
                    14px 的文字」（见下），编辑态必须照样把**同一枚标记**留在输入框前面，只是文字
                    换成输入框：标记拿走的那一刻，整行会往左跳「标记宽 ＋ 8px」。
                    标记按 em 取值（`DashMark` 的 `0.8em`），这一支的 wrapper 与输入框的 `font`
                    都取 `EXAMPLE_EDIT_FONT_SIZE`，探针与这一支画出来的尺寸才一致。 */}
                {form === 'example' && measureMarkSlot(
                  <DashMark color={editorMode ? MARK_COLOR[unitState(fv, inheritedUser)] : 'var(--ink-3)'} />
                )}
                <MeasuredInput
                  value={editValue}
                  font={
                    form === 'example'
                      ? { fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: `${EXAMPLE_EDIT_FONT_SIZE}px` }
                      : { fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)' }
                  }
                  mark={
                    form === 'example' ? measureMarkSlot(
                      <DashMark color={editorMode ? MARK_COLOR[unitState(fv, inheritedUser)] : 'var(--ink-3)'} />
                    ) : undefined
                  }
                  onChange={onEditValueChange}
                  onKeyDown={editKeyDown(def.fieldType, onSave, onCancelEdit)}
                />
              </span>
            )
          ) : (
            <span
              // 正文文字区的长按（v0.7.7 Task 5，spec §3.1）：打开本行的底部表。编辑态走上面
              // 另一个分支（输入框），输入框内不挂长按——系统选词 / 输入法手势原样保留。
              {...longPressProps}
              onClick={() => !touch && editorMode && onStartEdit(fv)}
              onDoubleClick={() => (touch || !editorMode) && onStartEdit(fv)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStartEdit(fv) } }}
              role="button"
              tabIndex={0}
              title={editorMode ? '点击编辑' : '双击编辑'}
              style={{ cursor: 'pointer' }}
            >
              {form === 'example' ? (
                // 例句（v0.7.2 缺陷 3）：与搜索返回页同一处理（DictDetailCard 的 `example` 分支）——
                // 衬线斜体 14px/1.65 次级色，行首一枚 `–` 作分条标识（showcase-v2:197-198）。
                // v0.7.4 决定九：`–` 改**画**（DashMark），且**按词自己着色**——取该单位自己的
                // `unitState`，不是所在容器的聚合态（两者可以不同）；普通模式恒三级色。
                <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '14px', lineHeight: '23px', color: 'var(--ink-2)' }}>
                  {/* 例句的 `–`（v0.7.7 Task 7，spec §3.4）：触摸下它是本行的**拖拽激活点**——
                      行自己的 `listeners` 展开在这个 span 上，长按横杠即可拖起该行。`pointerdown`
                      在这里止住冒泡：外层正文 span 挂着行级长按（弹表），这一下不能让它计时；
                      与行手柄那条 `onPointerDown` 拦截同一个理由。纵向命中层扩到 44px，横向仍贴
                      横杠宽度（不压住正文）。桌面不展开监听、不加包裹层，几何逐字不变。 */}
                  <span
                    {...(touch ? listeners : null)}
                    {...(touch
                      ? { onPointerDown: (e: React.PointerEvent<HTMLSpanElement>) => { e.stopPropagation() } }
                      : null)}
                    style={{
                      marginRight: '8px',
                      ...(touch ? { position: 'relative' as const, touchAction: 'none' as const } : null),
                    }}
                  >
                    <DashMark color={editorMode ? MARK_COLOR[unitState(fv, inheritedUser)] : 'var(--ink-3)'} />
                    {touch && <span aria-hidden="true" style={hitAreaStyle({ verticalOnly: true })} />}
                  </span>
                  <LinkedText value={fv.value} fieldKey={def.key} isInLibrary={isInLibrary} onJump={onJump} />
                </span>
              ) : form === 'english-def' ? (
                // v0.7.3 尾段 §1.3：英文释义在工作区本来没有分支，于是它在这里是无衬线正文色、
                // 在返回页是衬线次级色——同一个字段两页两样，草案第 6 条要修的就是它。
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: '15px', lineHeight: '26px', color: 'var(--ink-1)' }}>
                  <LinkedText value={fv.value} fieldKey={def.key} isInLibrary={isInLibrary} onJump={onJump} />
                </span>
              ) : (
                <LinkedText value={fv.value} fieldKey={def.key} isInLibrary={isInLibrary} onJump={onJump} />
              )}
            </span>
          )}
        </span>
      )}
    </>
  )

  return (
    <div
      ref={setRefs}
      data-field-id={fv.id}
      data-field-edit={isEditing ? 'true' : undefined}
      onMouseEnter={() => onHover(fv.id)}
      onMouseLeave={(e) => {
        // 行移出：把 hover 移交到指针进入的目标行（relatedTarget 最近 [data-field-id]），
        // 完全离开任何行则清空——修掉原「横向移出行到两侧留白仍在容器内导致按钮残留」（v0.4.3 §5）
        const rt = (e as React.MouseEvent<HTMLDivElement>).relatedTarget as HTMLElement | null
        const next = rt ? (rt.closest('[data-field-id]') as HTMLElement | null) : null
        onHover(next?.dataset.fieldId ?? null)
      }}
      style={{ position: 'relative', ...draggingStyle }}
    >
      {insertIndicator && insertIndicator.overId === fv.id && (
        <div
          style={{
            position: 'absolute', left: 0, right: 0,
            top: insertIndicator.before ? -2 : undefined,
            bottom: insertIndicator.before ? undefined : -2,
            height: '2px', background: 'var(--color-brand)', borderRadius: '1px', pointerEvents: 'none',
          }}
        >
          {/* 左端圆点（v0.7.4 任务 16）：6px 的品牌色圆点压在线的左端，top −2 让圆心落在
              2px 线的高度中点上；流外绝对定位，不占位、不改落点判定。 */}
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', left: 0, top: -2, width: 6, height: 6,
              borderRadius: '50%', background: 'var(--color-brand)',
            }}
          />
        </div>
      )}

      {/* 行体：组的根容器走 run-in 头（groupHead）；其余行走 FlowRow
          （来源条 / 义号 / 正文 / 行尾槽，行尾槽 = 来源标 + 操作簇，常驻占位）。
          v0.7.7 Task 5：这一层恰好是**本行**（不含子行）的盒子——底部表打开时把目标行的
          临时高亮挂在这里，子行不会被一起染上；内阴影 + 背景都不进布局，开 / 关零位移。 */}
      <div style={{ position: 'relative', ...(isSheetTarget ? SHEET_TARGET_STYLE : null) }}>
        {asGroupHead ? groupHead : (
          <FlowRow
            no={no}
            state={rowState}
            first={ownFirst}
            last={ownLast}
            focused={isFocused}
            end={hideRowActions ? undefined : (
              <RowActions
                visible={rowActionsVisible}
                mode={editorMode ? 'edit' : 'view'}
                touch={touch}
                onAdd={() => onToggleAddMenu(fv)}
                onDelete={() => onDelete(fv)}
                menu={<RowMenu items={menuItems} touch={touch} onOpen={touch ? () => onOpenRowSheet(fv) : undefined} />}
              />
            )}
          >
            <span style={{ display: 'flex', alignItems: 'baseline', gap: `${GUTTER_GAP}px`, flex: 1, minWidth: 0 }}>
              {grip}
              {content}
            </span>
          </FlowRow>
        )}

        {/* 行级「＋ 添加」菜单：加到本行所在容器（沿用 ALLOWED_CHILD_KEYS 的判据）。 */}
        {addMenu?.target === 'row' && addMenu.id === fv.id && containerFv && (
          <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 'var(--z-dropdown)' }}>
            <AddMenu
              title={`加到「${containerLabel}」`}
              items={containerChildDefs.map(d => ({ key: d.id, label: d.name, onPick: () => onPickAdd(containerFv, d) }))}
            />
          </div>
        )}
      </div>

      {/* 子行：run-in 头形态下子行由组装配另作义项行，此处不出。
          v0.7.2 缺陷 5：删去原先按 depth 加的缩进盒（marginLeft / paddingLeft / borderLeft）——
          设计稿（showcase-v2:184 的 .sense）全篇只有一层 11px 缩进、由 FlowRow 自己给，
          逐层再加会让子行偏离那条统一线。
          缺陷 6：子行与父行的间距由 8px / 4px 收到 0——设计稿里容器头与首个子项只隔
          .ex 的 4px（showcase-v2:196），而 FlowRow 自带的 4+4px 上下内边距已提供余量，
          原先那份额外 marginTop 正是「标题离子标题过远」的来源。 */}
      {!asGroupHead && hasChildren && (
        <div style={{ marginTop: 0 }}>
          {/* v0.7.3 §5.4：短叶子容器改走流式多列（LeafFlow），否则仍逐个 FieldCard。
              v0.7.3 尾段 §3.4：每个单位自带一枚**绝对定位**的行尾槽（LeafFlow 的 `end`）——
              绝对定位是硬要求：它一进排版流，悬停那一刻该单位会变宽、后继的词重新折行
              （与 v0.5.2 修过的行尾簇抖动同一个坑）。22px 正好等于栏距（gap: '6px 22px'），
              且按钮本身也是 22px（NAV_CONTROL_HEIGHT），一格一枚正好合上。
              编者模式**不传 onAdd**（D17）：单位上不设 ＋，往容器里加一项的入口是「近义词」容器行的 ＋。
              指针交互：`onMouseLeave` 交还**本行**的 id 而不是 `null`——指针从行的空白移到单位上时
              行自己的 `onMouseEnter` 不会重发，置 `null` 会让整行的 ⋯ 在指针仍在行内时消失。
              hover 由单位 span 上的 `onMouseEnter` / `onMouseLeave` 驱动（LeafFlow 的
              `onEnter` / `onLeave`）——这两个 handler 挂在**无条件渲染**的单位 span 上，
              而不是像之前挂在条件渲染的 wrapper 上（那样永远无法触发）。 */}
          {leafFlow && (
            <LeafFlow
              state={rowState}
              // 左缘 = 容器标题文字的左缘（v0.7.4 决定五 5.1）：标题在 11 + 手柄槽 10 + gap 4，
              // 故多列块要 `inset={25}`；默认的 11 会让第一个 `·` 凸到标题左边 14px。
              inset={LEAF_FLOW_INSET}
              // 触摸分支（v0.7.7 Task 7）：手柄常挂 + 44 高 × 22 宽命中层、`·` 可长按拖起、
              // 单位行尾槽整块不渲染（单位底部表已承载编辑 / 删除）。桌面不传时为 false。
              touch={touch}
              // 多单位块在分段里算「一行」：首末直接透传——段首/段末由块整体收口，
              // 块前若还有容器行（first=false）则条向上接进那一行。
              first={barFirst}
              last={barLast}
              // 单位手势（v0.7.4 任务 12）：注册 id 沿 FieldCard 同一约定（`id` / `drop-${id}`），
              // 故 lib/dragReorder 与两个 handler 一行不改——落点判定只看 id。选中框取被拖单位
              // （activeDragId）、手柄取悬停单位（hoveredId）、落点线取 insertIndicator。
              drag={{
                isDragging: id => activeDragId === id,
                hoveredId,
                indicator: insertIndicator,
              }}
              items={(fv.children ?? []).map(ch => ({
                id: ch.id,
                // 单位正文的长按（v0.7.7 Task 7）：手机上包一层 `UnitActivation`——每个单位
                // 一份 hook（不能写进 map），长按打开单位底部表。编辑态不挂（输入框归系统选词）；
                // 桌面保持原样的 `renderUnitContent`，不新增包裹节点。
                content: touch && editingId !== ch.id
                  ? <UnitActivation onLongPress={() => onOpenUnitSheet(fv, ch)}>{renderUnitContent(ch)}</UnitActivation>
                  : renderUnitContent(ch),
                // 小点的颜色（v0.7.4 决定九）：编者模式下取**该单位自己的**来源态——
                // `unitState` 已处理「容器是用户建的 → 整棵子树都算 personal」的继承优先，
                // 故用户自己添加的容器里的词全是用户色。普通模式一律三级色：否则阅读视图
                // 会冒出一片彩点，来源态是编者视角的信息（与 `rowSourceState` 同一门控）。
                markColor: editorMode ? MARK_COLOR[unitState(ch, childInheritedUser)] : 'var(--ink-3)',
                onEnter: () => onHover(ch.id),
                onLeave: () => onHover(fv.id),
                end: hoveredId === ch.id ? (
                  <RowActions
                    visible
                    mode={editorMode ? 'edit' : 'view'}
                    onDelete={() => onDelete(ch)}
                    menu={<RowMenu items={unitMenuItems(ch)} />}
                  />
                ) : undefined,
              }))}
            />
          )}
          {renderedChildren}
        </div>
      )}
    </div>
  )
}

interface Props {
  /**
   * 外壳形态（Android 手机外壳，Task 4）：`'mobile'` 时**不渲染内部 `WorkbenchNavBar`**——
   * 手机顶栏动作由 `MobileAppBar` 承担，两份导航条会叠成两条。页签条、头带、正文与页级
   * 「＋ 添加」一律保留，故手机与桌面看到的是同一份词条渲染。
   *
   * 缺省 `'desktop'`：桌面两个调用点（`AppShell`、`MobileShell` 之外）不传，行为逐字不变。
   */
  chrome?: 'desktop' | 'mobile'
  /**
   * 触摸语义（v0.7.8 平板）：与外壳形态**解耦**——平板仍是 `chrome='desktop'` 的三栏布局，
   * 但长按 / 双击 / 行尾簇 / 拖拽传感器等触摸分支必须生效。缺省由 `chrome === 'mobile'`
   * 推出，手机行为与 v0.7.7 逐字相同；桌面不传时恒为 false。
   */
  touch?: boolean
  /**
   * 编辑态上报（Task 5，手机外壳）：`chrome='mobile'` 时，「取消 / 保存」画在顶栏
   * （`MobileAppBar`），而编辑态三件套（`editingId` / `editValue` / `entryValue`）是本组件的
   * 局部 state，故由本组件把结论报给外壳。**只有手机端传**：桌面把这对按钮画在自己的
   * `WorkbenchNavBar` 里（props 见下），不经过外壳，传了也是死代码。
   *
   * 报的是**当前有没有在编辑 + 值是否改过**，与桌面 `editing` prop 同一个形状；判据也同一份
   * （`hasFieldChanges`）。回调在 effect 里调（见组件体内那个 `useEffect`），不在渲染期。
   */
  onEditStateChange?: (editing: { dirty: boolean } | null) => void
}

/**
 * 手机外壳要用的两个动作（Task 5）：保存 / 取消当前正在编辑的字段。
 * 经 `ref` 交出（`chrome='mobile'` 时才有 ref）——编辑态只存在于本组件体内。
 */
export interface WordWorkbenchHandle {
  saveEdit: () => void
  cancelEdit: () => void
}

// `forwardRef` 只为了让手机外壳拿到保存 / 取消（见 `WordWorkbenchHandle`）。
// 桌面两个调用点不传 ref，行为逐字不变。
const WordWorkbench = forwardRef<WordWorkbenchHandle, Props>(function WordWorkbench(
  { chrome = 'desktop', touch: touchProp, onEditStateChange }, ref,
) {
  const { words, selectedWordId, fieldValues, location, updateFieldValue, deleteWord, addFieldValue, deleteFieldValue, reorderFieldValues, libraryLocationOf, moveToArchive, moveToWorkspace } = useWordStore()
  const [defs, setDefs] = useState<FieldDefinition[]>([])
  const editorMode = useViewStore(s => s.editorMode)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [entryValue, setEntryValue] = useState('')  // 进入编辑时的值
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [addMenu, setAddMenu] = useState<AddMenuState>(null)
  // 手机底部表的状态（v0.7.7 Task 5 / fix Important 3）：`id` 同时驱动目标行的临时高亮
  // （`sheet?.id`，见 FieldCard 的 isSheetTarget），`items` 由 lib/mobileSheets 的判据生成。
  // 桌面永远为 null——没有任何桌面路径会置位（长按与手机 `⋯` 都被 `touch` 门控）。
  const [sheet, setSheet] = useState<MobileSheetState | null>(null)
  const [saved, setSaved] = useState(false)
  const [fadeIn, setFadeIn] = useState(true)
  const [insertIndicator, setInsertIndicator] = useState<InsertIndicator | null>(null)
  // 正在被拖动的节点 id（v0.7.4 任务 12 的单位、任务 16 的行）：LeafFlow 的 `drag.isDragging`
  // 由它派生——选中框只画在被拖的那一枚上；页面级 `dragGhost` 也用它解析副本内容。不从
  // dnd-kit 的 `useDraggable().isDragging` 取：LeafFlow 是哑组件，拖拽态经 props 进。
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [capsuleExpanded, setCapsuleExpanded] = useState(false)
  // 标签页记忆：用户停留的页；切换单词后若该页已不可见则经 effectiveTab 兜底回退到 defaultTab
  const [activeTab, setActiveTab] = useState<TabKey | null>(null)

  const { categories, wordCategoryIds, loadWordCategories } = useCategoryStore()
  const { openAssign, openEditor } = useUiStore()
  // 链接点击（v0.7.5 Task 4）：去向判定与跳转都在 hook 里，三处 `LinkedText` 共用这一份。
  const onJump = useLinkJump()

  // ── 手机触摸拖拽（v0.7.7 Task 6，spec §3.4）─────────────────────────────────────
  // 触摸分支的唯一门。`useSensor` / `useSensors` **无条件**在组件顶层调用（React #310 的同一条
  // 理由：hook 的位置不能随渲染分支变），只有**参数**取决于 `touch`。
  //
  // 长按 250ms 且位移不超过 8px 才起拖：与 `useTouchLongPress` 是同一组常量（`mobileHitArea.ts`），
  // 「长按正文弹表 / 长按手柄拖拽」的分界只由**按下的位置**决定，不由时长决定。
  // 手机**不挂** `KeyboardSensor`（spec §3.4）：TouchSensor 是唯一传感器。
  //
  // 桌面必须让 `sensors` 落到 `DndContext` 的默认值（Pointer + Keyboard）。注意 `useSensors()`
  // 在 dnd-kit v6.3.1 返回的是**过滤后的数组**而不是 null——把 `[]` 传下去会关掉全部传感器，
  // 故这里在 `touch` 为假时显式传 `undefined`（解构默认值只在 undefined 时生效）。
  // v0.7.8：`touch` 是独立 prop——平板沿用 `chrome='desktop'` 的布局，但触摸分支要开；
  // 手机不传，仍由外壳形态推出（v0.7.7 行为逐字不变）。布局分支继续只看 `chrome`。
  const touch = touchProp ?? chrome === 'mobile'
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: TOUCH_LONG_PRESS_MS, tolerance: TOUCH_SLOP_PX },
  })
  const sensors = useSensors(...(touch ? [touchSensor] : []))

  const selectedWord = words.find(w => w.id === selectedWordId)
  // 词级复习叠加层：词头徽标与记忆强度 chip 的数据源（v0.6.4）。wordId 只能取 selectedWordId。
  const wordId = selectedWordId ?? ''
  const overlay = useReviewOverlayStore(s => s.overlay[wordId])
  const leechThreshold = useSettingsStore(s => s.review.leechThreshold)

  useEffect(() => {
    getDefinitions().then(defs => setDefs(defs))
  }, [])

  // 切换单词自动加载该词分类（规格 §5.1）
  useEffect(() => {
    if (selectedWordId) loadWordCategories(selectedWordId)
  }, [selectedWordId])

  // 保存确认条（v0.7.2 恢复；Task 2 Ruling 12 把「保存脉冲条」的动画换成同一元素上的
  // background-color 过渡，故留下的是**确认**，不是脉冲）：置位后 500ms 自动收起。
  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 500)
    return () => clearTimeout(timer)
  }, [saved])

  // Fade-in on word switch
  useEffect(() => {
    setFadeIn(false)
    const raf = requestAnimationFrame(() => setFadeIn(true))
    return () => cancelAnimationFrame(raf)
  }, [selectedWordId])

  // Esc 关闭「＋ 添加」浮层：页级与行级共用同一份 addMenu 状态，故一处清空即可。
  // 行级 ⋯ 菜单由 ContextMenu 自管（它自己监听 Esc / 点外）。原先 ⋯ 菜单里的「添加子词条」
  // 二级展开已取消——子类型改由行尾 ＋ 打开 AddMenu 提供（见 FieldCard 的 containerChildDefs）。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAddMenu(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // 切换编者模式时收起工作台浮层（v0.5.2 任务 6）：旧的切换开关会一并清空菜单状态。
  useEffect(() => {
    setAddMenu(null)
  }, [editorMode])

  // 编辑态上报（Task 5，手机外壳）：编辑态三件套都是本组件的局部 state，而「取消 / 保存」
  // 画在顶栏（`MobileAppBar`），故由这里把结论报给外壳。判据与桌面那份 `editing` prop 逐字
  // 一致（`hasFieldChanges`），只是方向相反——桌面是外壳传进来、这里是本组件传出去。
  //
  // 走 effect 而不是渲染期 setState：渲染期上报会让每一次按键都同步重挂外壳（含正在输入的
  // 那个输入框），代价落在最不该慢的一条路径上。`onEditStateChange` 未传时整段短路——
  // 桌面不传（它把这对按钮画在自己的 `WorkbenchNavBar` 里），依赖数组保持空、零成本。
  //
  // 初值刻意**不报**（`ref` 门）：从 `null` 到 `null` 的上报是白跑一趟——外壳为此多渲染一次，
  // 且中间那一帧顶栏会按「没在编辑」画，闪一下。状态真变了才报，报完把 ref 记成已报的值。
  const lastEditReport = useRef<{ dirty: boolean } | null>(null)
  useEffect(() => {
    if (!onEditStateChange) return
    const next = editingId ? { dirty: hasFieldChanges(editValue, entryValue) } : null
    if (next === null && lastEditReport.current === null) return
    if (next && lastEditReport.current && next.dirty === lastEditReport.current.dirty) return
    lastEditReport.current = next
    onEditStateChange(next)
  }, [onEditStateChange, editingId, editValue, entryValue])

  // 卸载时把编辑态报回 null：详情态会**替换**掉本组件（`ViewStore.activeView === 'dict'`），
  // 若编辑中恰好跳到详情页，外壳那份 `editing` 会停在最后上报的值——顶栏继续画「取消 / 保存」，
  // 而 `ref` 已随卸载失效，两个键都成了空操作，色条与 ⋯ 也被一起藏掉。
  // 只挂在卸载上（独立 effect、依赖是稳定回调），不放进上面那个 effect 的 cleanup——
  // 那条 cleanup 每次依赖变化都会跑，会把「正在编辑」误报成 null。
  useEffect(() => () => { onEditStateChange?.(null) }, [onEditStateChange])

  // 内联编辑点外关闭：点击编辑行外部且未改动时退出编辑（有改动保持，供继续编辑/保存）
  useEffect(() => {
    if (!editingId) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-field-edit]')) return   // 编辑行内（输入框）不处理
      if (!hasFieldChanges(editValue, entryValue)) setEditingId(null)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [editingId, editValue, entryValue])

  // ── 手机外壳的保存 / 取消（Task 5）──────────────────────────────────────────────
  // **这两个 hook 必须在下面的空态早退之前**：`if (!selectedWord) return <EmptyState/>` 会在
  // 空态少走一段渲染体，若把它们留在早退之后，从空态切到选中词的那一次渲染 hook 数就变了
  // （少 2 个 → 多 2 个），React 直接抛生产错误 #310（Rendered more hooks than during the
  // previous render），真机上表现为整页「出了点问题」。hook 的位置必须与渲染分支无关。
  //
  // 工厂里只做**转发**：`handleSave` 每个渲染重造（它读 `editingId` / `editValue` / `entryValue`
  // 三件局部 state），那个函数定义在早退之后，故经 ref 取最新一份——`useImperativeHandle` 的
  // 工厂只在挂载时建一次，直接闭包住首次渲染的 `handleSave` 会让手机顶栏的「保存」永远撞上
  // `if (!editingId) return`，成了永久空转的按钮。
  const handleSaveRef = useRef<() => Promise<void>>(async () => {})
  useImperativeHandle(ref, () => ({
    saveEdit: () => { void handleSaveRef.current() },
    cancelEdit: () => setEditingId(null),
  }), [])

  if (!selectedWord) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState message="选择一个单词开始查看" />
      </div>
    )
  }

  const handleStartEdit = (fv: FieldValue) => {
    setEditingId(fv.id)
    setEditValue(fv.value || '')
    setEntryValue(fv.value || '')
  }

  // 行级「＋ 添加」菜单的开关：三处入口共用同一份判据——桌面行尾 ＋、桌面 ⋯ 菜单、
  // 手机底部表的「添加子项」（v0.7.7 Task 5 起）。抽成具名函数，三处不可能各说各话。
  const handleToggleAddMenu = (fv: FieldValue) =>
    setAddMenu(prev => prev?.target === 'row' && prev.id === fv.id ? null : { target: 'row', id: fv.id })

  // ── 手机行级底部表（v0.7.7 Task 5，spec §3.1 / §3.3）────────────────────────────
  // 条目模型与文案的唯一出处是 lib/mobileSheets 的 `rowSheetItems`（与桌面 `menuItems`
  // 同一份判据）；这里只做三件事：认出行、拼标题、存 state。打开表即置位 `sheet.id` →
  // 目标行临时高亮；关表清空、不留选中态。桌面没有调用点（长按与 `⋯` 都被 `touch` 门控）。
  const openRowSheet = (fv: FieldValue) => {
    const def = defs.find(d => d.id === fv.fieldId)
    if (!def) return
    setSheet({
      kind: 'row',
      id: fv.id,
      // 标题 = 被长按对象的文本（spec §3.3）：有正文取正文，容器类没有正文时退到字段名。
      // 链接标记在纯文本标题里没有意义，与 rowTitle 同口径先剥掉。
      title: fv.value.trim() ? stripLinks(fv.value) : def.name,
      items: rowSheetItems({
        isContainer: CONTAINER_FIELD_KEYS.includes(def.key),
        isPosPane: def.key === 'part_of_speech',
        isGroupPane: def.key === 'synonym_discrimination_group',
        rowHasAllowedChildren: (ALLOWED_CHILD_KEYS[def.key] ?? []).length > 0,
      }),
    })
  }

  // ── 手机单位底部表（v0.7.7 Task 7，spec §3.4）──────────────────────────────────
  // 流式单位（近义词 / 词源相关词 / 词形变化等）没有 FieldCard，行级入口到不了它们，
  // 故单位正文长按自开一张表。条目只有编辑 / 删除（`unitSheetItems`，D17 同一判据）；
  // 表目标仍存进同一份 `sheet` state——`onPick` 按 id 在字段树里解析，单位也在这棵树里，
  // 于是 `handleSheetPick` 的 edit / delete 映射天然复用单位自己的回调，不另写一套。
  // `containerFv` 只用于标题兜底（单位正文为空时退到字段名），行为仍只看单位自己。
  const openUnitSheet = (containerFv: FieldValue, unit: FieldValue) => {
    const def = defs.find(d => d.id === unit.fieldId)
    const containerDef = defs.find(d => d.id === containerFv.fieldId)
    setSheet({
      kind: 'unit',
      id: unit.id,
      title: unit.value.trim() ? stripLinks(unit.value) : (def?.name ?? containerDef?.name ?? ''),
      items: unitSheetItems(),
    })
  }

  // ── 手机行级「添加子项」grid 表（v0.7.7 fix Important 3，spec §3.9 不变量 5 / §3.3）──
  // 行菜单选「添加子项」后面临的是**同一批选项**，桌面用 AddMenu 弹层、手机必须走
  // MobileActionSheet 的 grid 形态。容器判据与 FieldCard 的 `containerFv` 逐字相同：
  // 容器行或有可加子类的行取自己，否则回落到父节点——叶子行（释义）的「添加子项」
  // 实际加到父级词性窗格，桌面 AddMenu 也是这么做的。
  // 目标 id 仍记被长按的那一行，保持目标行高亮不跳。
  const openAddChildSheet = (fv: FieldValue) => {
    const def = defs.find(d => d.id === fv.fieldId)
    if (!def) return
    const isContainer = CONTAINER_FIELD_KEYS.includes(def.key)
    const rowHasAllowedChildren = (ALLOWED_CHILD_KEYS[def.key] ?? []).length > 0
    const containerFv = isContainer || rowHasAllowedChildren
      ? fv
      : (fv.parentId ? findFieldValueById(fv.parentId) : undefined)
    if (!containerFv) return
    const containerDef = defs.find(d => d.id === containerFv.fieldId)
    if (!containerDef) return
    const childDefs = defs.filter(d => (ALLOWED_CHILD_KEYS[containerDef.key] ?? []).includes(d.key))
    setSheet({
      kind: 'addChild',
      id: fv.id,
      title: `加到「${containerDef.name}」`,
      mode: 'grid',
      containerId: containerFv.id,
      items: addChildSheetItems(childDefs),
    })
  }

  // Recursively find a FieldValue by its id within the tree (root values + nested children)
  const findFieldValueById = (id: string, values: FieldValue[] = fieldValues): FieldValue | undefined => {
    for (const fv of values) {
      if (fv.id === id) return fv
      if (fv.children?.length) {
        const found = findFieldValueById(id, fv.children)
        if (found) return found
      }
    }
    return undefined
  }

  const handleSave = async () => {
    if (!editingId) return
    const fv = findFieldValueById(editingId)
    if (!fv) return
    // 词性空标签校验（Task 10 §Step 4）：词性父必须有非空标签
    if (defKeyByFieldId.get(fv.fieldId) === 'part_of_speech' && !editValue.trim()) {
      await useUiStore.getState().confirm({ title: '词性标签不能为空', message: '请为词性填写标签后再保存。', alertMode: true })
      return
    }
    // 链接校验（v0.7.5 Task 2）：放在「未改动早退」**之后**——按 Enter 保存一段没改过的
    // 文本时，旧链接里的失效目标与这次编辑无关，不该拦住关闭编辑框。改过的文本仍然一律校验。
    if (editValue === entryValue) { setEditingId(null); return }  // 未真实修改：不置位
    const defKey = defKeyByFieldId.get(fv.fieldId) ?? ''
    if (linkableField(defKey)) {
      const errs = validateLinks(editValue, isWordInLibrary)
      if (errs.length > 0) {
        await useUiStore.getState().confirm({ title: '链接有误', message: linkErrorText(errs), alertMode: true })
        return
      }
    }
    if (fv.source === 'user') {
      await updateFieldValue(fv.id, { value: editValue })  // 个人字段保持 personal
    } else {
      await updateFieldValue(fv.id, {
        value: editValue,
        edited: true,
        originalValue: fv.originalValue ?? entryValue,  // 保留既有 original_value
      })
    }
    setEditingId(null)
    setSaved(true)  // 保存确认条：仅在真实落库后置位（未改动早退的那条不置）
  }

  // ── 手机外壳的保存 / 取消（Task 5）──────────────────────────────────────────────
  // 两个 hook 本身已在上面（空态早退之前）声明，原因见那处注释。这里只把**最新一份**
  // `handleSave` 存进 ref：赋值写在渲染体里而不是 effect 里——effect 会晚一帧，
  // 那一帧里点保存仍会落空。
  handleSaveRef.current = handleSave
  // 桌面那对回调直接复用同一组：`WorkbenchNavBar` 的 `onSaveEdit` / `onCancelEdit` 语义逐字相同
  // （桌面版此前是内联箭头函数，换成同一组稳定引用）。注意这两个**不是** useCallback——它们
  // 每个渲染重造，稳定性由 `WorkbenchNavBar` 那侧不把它们放进依赖数组来保证（与 v0.7.4 前
  // 的内联箭头函数等价）。
  const saveEdit = () => { void handleSave() }
  const cancelEdit = () => setEditingId(null)

  const handleDelete = async () => {
    const ok = await useUiStore.getState().confirm(deleteWordConfirmRequest(selectedWord.lemma))
    if (!ok) return
    await deleteWord(selectedWord.id)
  }

  // 移入 / 移回（v0.7.5 Task 11）：确认框与另外两处入口共用同一份文案（lib/archiveMove），
  // store 只执行移动。移动的是当前选中词——成功后 selectedWordId 清空，本组件落到空态。
  const handleMoveWord = async () => {
    const to = moveTarget(location)
    const ok = await useUiStore.getState().confirm(moveConfirmRequest(to, selectedWord.lemma))
    if (!ok) return
    if (to === 'archive') await moveToArchive(selectedWord.id)
    else await moveToWorkspace(selectedWord.id)
  }

  // 添加字段：主标签页直接加根容器（词性/补充）；单独标签页直接挂项到根容器下（无则先建空容器）→ 自动进入编辑态
  const handleAddField = async (def: FieldDefinition) => {
    setAddMenu(null)
    let parentId: string | null | undefined
    // 仅当新增的是当前单独标签页的直接项时，才挂到其根容器下（音标等根级字段仍加在根）
    if (effectiveTab && effectiveTab !== 'main' && addableLeafKeys(effectiveTab).includes(def.key)) {
      const rootKey = TAB_GROUPS[effectiveTab].roots[0]
      let container: FieldValue | null = contentRoots.find(fv => defKeyByFieldId.get(fv.fieldId) === rootKey) ?? null
      if (!container) {
        const containerDef = defs.find(d => d.key === rootKey)
        if (!containerDef) return
        container = await addFieldValue(containerDef.id)
        if (!container) return
      }
      parentId = container.id
    }
    const fv = await addFieldValue(def.id, parentId)
    if (!fv) return
    // 非词性容器无值格可编辑：不进入幻影编辑态（词性有独立标签编辑路径，保留自动进入）
    if (CONTAINER_FIELD_KEYS.includes(def.key) && def.key !== 'part_of_speech') return
    setEditingId(fv.id)
    setEditValue('')
    setEntryValue('')
  }

  // 添加词根项：挂到首个/当前 word_root 容器下（无则先建空容器）→ 自动进入编辑态。
  const handleAddWordRoot = async () => {
    setAddMenu(null)
    const rootItemDef = defs.find(d => d.key === 'word_root_item')
    if (!rootItemDef) return
    let container: FieldValue | null = wordRootValues[0] ?? null
    if (!container) {
      const containerDef = defs.find(d => d.key === 'word_root')
      if (!containerDef) return
      container = await addFieldValue(containerDef.id)
      if (!container) return
    }
    const fv = await addFieldValue(rootItemDef.id, container.id)
    if (!fv) return
    setEditingId(fv.id)
    setEditValue('')
    setEntryValue('')
  }

  // 加号添加标签页：为其首个根字段创建空容器记录（空容器不进入编辑态）
  const handleAddTab = async (tab: TabKey) => {
    setAddMenu(null)
    const def = defs.find(d => d.key === TAB_GROUPS[tab].roots[0])
    if (!def) return
    await addFieldValue(def.id)
    setActiveTab(tab)
  }

  // 删除标签页：级联删除该标签页全部根容器及其子树（页签 × / 右键菜单共用）
  const handleDeleteTab = async (tab: TabKey) => {
    const roots = groups[tab] ?? []
    if (roots.length === 0) return
    const name = TAB_GROUPS[tab].label
    const ok = await useUiStore.getState().confirm({
      title: `删除「${name}」标签页`,
      message: `将删除该标签页下全部内容（${roots.length} 个容器及其子词条），此操作不可撤销。`,
      danger: true,
    })
    if (!ok) return
    for (const fv of roots) await deleteFieldValue(fv.id)
    if (activeTab === tab) setActiveTab(null)
  }

  // 添加子词条：挂到当前节点下 → 自动进入编辑态（Task 10 §Step 2）
  const handleAddChild = async (parentFv: FieldValue, childDef: FieldDefinition) => {
    setAddMenu(null)
    const fv = await addFieldValue(childDef.id, parentFv.id)
    if (!fv) return
    // 子容器（如 definition 下的 example_sentence/synonyms）无值格可编辑：不进入幻影编辑态。
    // 近义词辨析组是带描述值（组小标题）的容器：加入后直接填描述
    if (CONTAINER_FIELD_KEYS.includes(childDef.key) && childDef.key !== 'synonym_discrimination_group') return
    setEditingId(fv.id)
    setEditValue('')
    setEntryValue('')
  }

  // 单节点删除：级联确认，含子级时提示删除子树（Task 10 §Step 3）
  const handleDeleteField = async (fv: FieldValue) => {
    setAddMenu(null)
    const name = defs.find(d => d.id === fv.fieldId)?.name ?? (fv.value || '字段')
    const hasKids = !!(fv.children && fv.children.length > 0)
    const ok = await useUiStore.getState().confirm({
      title: `删除「${name}」`,
      message: hasKids ? '该词条包含子词条，将一并删除。此操作不可撤销。' : '此操作不可撤销。',
      danger: true,
    })
    if (!ok) return
    await deleteFieldValue(fv.id)
  }

  // 拖拽重排（规格 §5.5）：仅同级；拖动中行原位淡出（opacity 0.35 + 极浅品牌底，不缩放、
  // 不投影），跟手的副本由 DragOverlay 画；目标处 2px 品牌色插入线（左端一枚圆点）
  const handleDragStart = (event: DragStartEvent) => {
    setInsertIndicator(null)
    // 记下被拖节点（v0.7.4 任务 12 的单位、任务 16 的行）：LeafFlow 据此给该单位画选中框。
    setActiveDragId(String(event.active.id))
    // 手机：长按成立、进入拖拽时补一次与行菜单同一个反馈（v0.7.7 Task 6，spec §3.4）。
    // 桌面不起 TouchSensor，`touch` 为假，这一行在桌面是死代码。
    if (touch) navigator.vibrate?.(10)
  }

  // 拖动行的中线：键盘拖动时没有指针，用它作落点兜底
  const draggedCenterY = (active: DragEndEvent['active']): number => {
    const rect = active.rect.current.translated
    return rect ? rect.top + rect.height / 2 : 0
  }

  // 落点纵坐标（v0.5.3 任务 4）：以指针相对目标行中线判定插入前后。
  const dropYOf = (event: DragOverEvent | DragEndEvent): number =>
    dropY(event.activatorEvent, event.delta.y, draggedCenterY(event.active))

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) { setInsertIndicator(null); return }
    const targetId = String(over.id).replace(/^drop-/, '')
    if (targetId === String(active.id)) { setInsertIndicator(null); return }  // 落在自身
    const dragged = findFieldValueById(String(active.id))
    const target = findFieldValueById(targetId)
    if (!dragged || !target || dragged.parentId !== target.parentId) {  // 仅同级
      setInsertIndicator(null)
      return
    }
    setInsertIndicator({ overId: targetId, before: insertBefore(dropYOf(event), over.rect) })
  }

  const handleDragCancel = () => {
    setInsertIndicator(null)
    setActiveDragId(null)
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setInsertIndicator(null)
    setActiveDragId(null)
    const { active, over } = event
    if (!over) return
    const targetId = String(over.id).replace(/^drop-/, '')
    const dragged = findFieldValueById(String(active.id))
    const target = findFieldValueById(targetId)
    if (!dragged || !target || dragged.parentId !== target.parentId) return  // 仅同级重排
    const siblings = (dragged.parentId
      ? (findFieldValueById(dragged.parentId)?.children ?? [])
      : fieldValues.filter(fv => !fv.parentId))
    const nextIds = reorderSiblingIds(
      siblings.map(s => s.id), dragged.id, target.id,
      insertBefore(dropYOf(event), over.rect),
    )
    if (!nextIds) return  // 落点是自身 / 同级集合已变：不写库
    await reorderFieldValues(nextIds.map((id, i) => ({ id, displayOrder: i })))
  }

  // 头部音标：从 fieldValues 经 defs 反查 key 提取
  const defKeyByFieldId = new Map(defs.map(d => [d.id, d.key]))

  // 根级字段拆分：音标 → 头带；其余 → 标签页
  const rootValues = fieldValues.filter(fv => !fv.parentId)
  const phoneticValues = rootValues.filter(fv => defKeyByFieldId.get(fv.fieldId) === 'phonetic')
  const wordRootValues = rootValues.filter(fv => defKeyByFieldId.get(fv.fieldId) === 'word_root')
  const contentRoots = rootValues.filter(fv => {
    const k = defKeyByFieldId.get(fv.fieldId)
    return k !== 'phonetic' && k !== 'word_root'
  })
  const keyOfFv = (fv: FieldValue) => defKeyByFieldId.get(fv.fieldId) ?? fv.fieldId

  const tabs = visibleTabs(contentRoots, keyOfFv)
  const effectiveTab = activeTab && tabs.includes(activeTab) ? activeTab : (defaultTab(contentRoots, keyOfFv) ?? null)
  const groups = groupRootsByTab(contentRoots, keyOfFv)
  const tabRoots = effectiveTab ? (groups[effectiveTab] ?? []) : []
  const sortedTabValues = sortTreeByTemplate(keyOfFv, tabRoots)
  // 单独标签页（短语/词形变化/派生词）：跳过根容器行，直接平铺其子项；主标签页渲染容器
  const isFlatTab = effectiveTab !== null && effectiveTab !== 'main'
  const isGroupTab = isFlatTab && effectiveTab !== null && isGroupedTab(effectiveTab)

  const wordCapsules = categories.filter(c => wordCategoryIds.includes(c.id))
  const showMoreCapsules = wordCapsules.length > 4
  const shownCapsules = showMoreCapsules ? wordCapsules.slice(0, 3) : wordCapsules
  const extraCapsules = showMoreCapsules ? wordCapsules.slice(3) : []

  const cardCtx: FieldCardCtx = {
    defs,
    editorMode,
    // v0.7.7 Task 4：触摸分支的唯一门（spec §6 不变量 1）。
    touch,
    // v0.7.7 Task 5：底部表的目标行高亮 + 打开入口（长按正文 / 容器标题、手机 ⋯ 共用）。
    sheetTargetId: sheet?.id ?? null,
    onOpenRowSheet: openRowSheet,
    onOpenUnitSheet: openUnitSheet,
    editingId,
    editValue,
    insertIndicator,
    activeDragId,
    addMenu,
    onStartEdit: handleStartEdit,
    onEditValueChange: setEditValue,
    onSave: handleSave,
    onCancelEdit: () => setEditingId(null),
    onDelete: handleDeleteField,
    onToggleAddMenu: handleToggleAddMenu,
    onPickAdd: handleAddChild,
    hoveredId,
    onHover: setHoveredId,
    // 失效态判据（v0.7.5 Task 3）：索引的键已是归一化词面，`libraryLocationOf` 内部再归一化一次
    // （幂等），`LinkedText` 也按同一份归一化传目标——判据与保存校验同源。
    isInLibrary: lemma => libraryLocationOf(lemma) !== null,
    // 点击去向（v0.7.5 Task 4）：工作区词条 / 词典词 / 失效提示由 `useLinkJump` 判定并执行，
    // 渲染层（`LinkedText`）仍然只把 token 交出来。
    onJump,
  }

  // 底部表的 onPick 映射（v0.7.7 Task 5 / fix Important 3）：行菜单 edit → 行内编辑、
  // addChild → **手机 grid 添加表**（不再回落到桌面 AddMenu 弹层）、delete → 删除确认；
  // 添加表的 key 是字段定义 id / 标签页前缀 / 两个哨兵，统一映射回桌面同一批 handler。
  // **每个分支都先清空 sheet state 再执行**——Task 3 的组件刻意不自动关，
  // 调用点必须自己收；先清再执行也让「删除确认框 / 编辑态 / 下一张表」不叠在表底下。
  const handleSheetPick = (key: string) => {
    const target = sheet
    if (!target) return
    setSheet(null)

    if (target.kind === 'addChild') {
      const def = defs.find(d => d.id === key)
      const containerFv = target.containerId ? findFieldValueById(target.containerId) : undefined
      if (def && containerFv) void handleAddChild(containerFv, def)
      return
    }

    if (target.kind === 'pageAdd') {
      if (key.startsWith(SHEET_ADD_TAB_PREFIX)) {
        const tab = key.slice(SHEET_ADD_TAB_PREFIX.length) as TabKey
        if (TAB_GROUPS[tab]) void handleAddTab(tab)
        return
      }
      if (key === SHEET_ADD_WORD_ROOT) { void handleAddWordRoot(); return }
      if (key === SHEET_ADD_PHONETIC) {
        const d = defs.find(x => x.key === 'phonetic')
        if (d) void handleAddField(d)
        return
      }
      const def = defs.find(d => d.id === key)
      if (def) void handleAddField(def)
      return
    }

    const fv = target.id ? findFieldValueById(target.id) : undefined
    if (!fv) return
    if (key === 'edit') cardCtx.onStartEdit(fv)
    else if (key === 'addChild') openAddChildSheet(fv)
    else if (key === 'delete') void cardCtx.onDelete(fv)
  }

  const tabLabel = effectiveTab ? TAB_GROUPS[effectiveTab].label : ''
  // 正文流（SenseFlow）：字段列表走一条正文流。
  //  · 主标签页：**每个根容器一个组**，run-in 头就是该容器的头——词性窗格给出 POS 标签（衬线斜体）
  //    + 中/英计数，其余根容器（补充）用字段名；头里保留窗格自己的拖拽 / 编辑 / 行尾簇，子行（释义…）
  //    作义项行。这与返回页「每个顶层容器一个 run-in 头」的用法一致。
  //  · 平铺标签页：整体一个头（页签名），子项直接作义项行（与旧行为一致，根容器仍跳过）。
  // 每行连同其父节点一起带上——行尾「＋」要加到**本行所在容器**，叶子行的容器就是父节点。
  const flatRows: { fv: FieldValue; parentFv: FieldValue; depth: number }[] = sortedTabValues
    .flatMap(root => (root.children ?? []).map(child => ({ fv: child, parentFv: root, depth: isGroupTab ? 0 : 1 })))
  const flowGroups: SenseGroup[] = isFlatTab
    ? (flatRows.length > 0
        ? [{ pos: tabLabel, items: flatRows.map(({ fv, parentFv, depth }) => (
            // 平铺分支也要回答「这一行该印什么」：辨析组取组描述、项类型留空——与分组分支同一函数，
            // 否则组行回落 def.name，印出字段名「近义词辨析组」。
            <FieldCard
              key={fv.id} fv={fv} depth={depth} parentFv={parentFv}
              labelOverride={rowTitle(keyOfFv(fv), fv.value, defs.find(d => d.id === fv.fieldId)?.name ?? '')}
              // 平铺标签页的行走廊不在任何释义子树里（根容器只以页签名作 run-in 头、自己不出条），
              // 故每行独立成段：first/last 都是 true，颜色取根容器的聚合态（决定九）。
              barState={containerState(parentFv, false)}
              barFirst
              barLast
              inheritedUser={parentFv.source === 'user'}
              {...cardCtx}
            />
          )) }]
        : [])
    : sortedTabValues.map(root => {
        const counters = { zh: 0, en: 0 }
        const rootKey = keyOfFv(root)
        // 主标签页的根容器是 run-in 头（自己不出条），它的直属子项由本处映射：
        // 每一行最近的可着色容器就是根容器，故聚合态在根上算一次即可。
        // 段只以**释义**为界：词性窗格的直属子项（中/英释义）各自开启一段，
        // 其余根容器（补充）的直属子项维持一行一条。
        const rootBarState = containerState(root, false)
        const rootInheritedUser = root.source === 'user'
        const segmented = rootKey === 'part_of_speech'
        return {
          head: <FieldCard key={root.id} fv={root} depth={0} parentFv={null} asGroupHead {...cardCtx} />,
          items: (root.children ?? []).map(child => (
            <FieldCard
              key={child.id} fv={child} depth={1} parentFv={root}
              labelOverride={childLabelOverride(rootKey, keyOfFv(child), child, counters)}
              barState={rootBarState}
              // 释义行（词性窗格的每个直属子项）是段首；它有子级时自己不能在下面收口，
              // 末行交给最后一个后代叶子。无子级则单行成段（barLast 默认 true）。
              barFirst
              barLast={!(segmented && (child.children?.length ?? 0) > 0)}
              inheritedUser={rootInheritedUser}
              {...cardCtx}
            />
          )),
        }
      })

  // 页级「＋ 添加」菜单条目：本标签页全部可加项（沿用 addableLeafKeys 判据）+ 新建标签页 / 词根 / 音标
  const pageAddFieldDefs = effectiveTab
    ? defs.filter(d => addableLeafKeys(effectiveTab).includes(d.key))
    : []
  const pageAddItems: AddItem[] = pageAddFieldDefs.map(d => ({ key: d.id, label: d.name, onPick: () => handleAddField(d) }))
  const missing = missingTabs(contentRoots, keyOfFv)
  const pageAddExtra = (
    <div style={{ borderTop: '1px solid var(--color-border)', marginTop: '5px', paddingTop: '5px' }}>
      <div style={{ fontSize: '10.5px', color: 'var(--color-text-tertiary)', padding: '4px 9px 2px' }}>新建标签页</div>
      {missing.length === 0 && <div style={{ padding: '6px 10px', fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>无可添加的标签页</div>}
      {missing.map(t => (
        <button key={t} type="button" onClick={() => handleAddTab(t)} style={menuItemStyle}
          onMouseEnter={e => menuItemHover(true, e.currentTarget)} onMouseLeave={e => menuItemHover(false, e.currentTarget)}>
          {TAB_GROUPS[t].label}
        </button>
      ))}
      <button type="button" onClick={handleAddWordRoot} style={menuItemStyle}
        onMouseEnter={e => menuItemHover(true, e.currentTarget)} onMouseLeave={e => menuItemHover(false, e.currentTarget)}>
        添加词根
      </button>
      <button type="button" onClick={() => { const d = defs.find(x => x.key === 'phonetic'); if (d) handleAddField(d) }} style={menuItemStyle}
        onMouseEnter={e => menuItemHover(true, e.currentTarget)} onMouseLeave={e => menuItemHover(false, e.currentTarget)}>
        添加音标
      </button>
    </div>
  )

  // 手机页级「＋ 添加」的 grid 表（v0.7.7 fix Important 3）：与桌面同一个入口按钮、
  // 同一批选项（`pageAddSheetItems` 直接从 `pageAddFieldDefs` / `missing` 生成，文案同源），
  // 只是形态换成 MobileActionSheet 的 grid。桌面仍走下面的 AddMenu 弹层。
  const openPageAddSheet = () => {
    setSheet({
      kind: 'pageAdd',
      id: null,
      title: tabLabel ? `添加到「${tabLabel}」` : '添加',
      mode: 'grid',
      items: pageAddSheetItems({
        fieldDefs: pageAddFieldDefs,
        missingTabs: missing.map(t => ({ key: t, label: TAB_GROUPS[t].label })),
      }),
    })
  }

  // 头带里的字段行（音标 / 词根）：与返回页同一形态。标签取 `lib/labelStyle.ts` 的
  // FIELD_LABEL_STYLE——44px 定宽列 / 10.5px / 600 / 字距 0.1em；墨色按两档规则走：
  // 白面（surface）标签用 `--color-label`（本常量），主题色面用次级文字色（LABEL_ON_THEME），
  // 与工作区正文的「中文释义(n)」是同一套字形、也与返回页 WordTitleExtras 共用同一份常量
  // （v0.7.4 决定七 7.3；v0.7.6 收进 C1；先前是 62px / 11.5px / 常规字重 / 三级字色，两页看着不是一列）。
  // 各行 gap 同为 8px（BAND_LABEL_GAP），与返回页 WordTitleExtras 一致（v0.7.4 由 10 收到 8）。
  // （分类行 v0.7.3 起挪进头带行右端 rightCluster，不再是字段行。）

  // 记忆强度（v0.7.2 缺陷 1；v0.7.3 标签改由本页印）：「记忆强度」那枚标签现在由本文件下方的
  // `bottomRight` 写出（头带自身不印标签），故这里只给 5 格方块 + 悬停明细——**不要**改传带标签的
  // StrengthChip，否则「记忆强度」会印两遍。方块与浮层复用同一套共享件
  // （masteryBlocks / MASTERY_COLORS / displayTier / WordMasteryTooltip），与 StrengthChip 同源；
  // 本页只用「方块」这一半，带标签的整簇 StrengthChip 因此不再被引用。
  // 熟悉度回落（v0.7.5 修正）：工作区词的 overlay 自带 familiarity；储藏库词不参与复习、
  // `foldWordReadings` 把它们过滤掉，overlay 里没有条目。此时读词条自己存的
  // `initial_familiarity`（已加载的 fieldValues），否则归档词一律显示成「陌生」。
  const fieldFamiliarity = familiarityFromValue(
    fieldValues.find(fv => defKeyByFieldId.get(fv.fieldId) === 'initial_familiarity')?.value,
  )
  const familiarity = overlay?.familiarity ?? fieldFamiliarity
  const masteryTier = displayTier({ stability: overlay?.weakestStability ?? null, familiarity })
  const mastery = masteryBlocks(masteryTier)
  const strengthNode = (
    <Tooltip content={<WordMasteryTooltip wordId={selectedWord.id} weakestStability={overlay?.weakestStability ?? null} familiarity={familiarity} />}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2.5, flexShrink: 0 }}>
        {Array.from({ length: mastery.total }, (_, i) => (
          <i key={i} style={{
            width: 7, height: 9, borderRadius: 2, display: 'inline-block',
            background: i < mastery.filled ? MASTERY_COLORS[masteryTier] : MASTERY_COLORS[0],
          }} />
        ))}
      </span>
    </Tooltip>
  )

  // 顽固词门控（v0.7.2 起；v0.7.3 从头带 prop 内联改为组件体内的常量，喂 `bottomRight`）：
  // `overlay.maxLapses` 对非顽固词是 0，直接传会把全库每个词都标成「连错 0 次」；门控属页面
  // （它才拿得到设置）。`> 0` **不可**代用——阈值可配且 `isLeech` 在阈值为 0（「关掉」）时返回 false。
  const leechCount = overlay && isLeech(overlay.maxLapses, leechThreshold) ? overlay.maxLapses : undefined

  // 拖拽副本的正文（v0.7.4 任务 16，R43）：可拖 id 有两类——行 id（FieldCard 注册的 `fv.id`）
  // 与单位 id（LeafFlow 注册的 `id`）。两者都是同一棵 fieldValues 树里的节点，故统一走
  // findFieldValueById 解析一次，再经字段定义取字体壳；解析不到（id 已失效 / 定义未加载）就
  // **不画副本**，而不是抛错或画空盒子。
  // 容器行本身没有值（它显示的是字段名 / 词性值），故空值回落到字段名；两者都空则仍不画。
  const dragGhost = (() => {
    if (!activeDragId) return null
    const fv = findFieldValueById(activeDragId)
    const def = fv ? defs.find(d => d.id === fv.fieldId) : undefined
    if (!fv || !def) return null
    // 副本显示的是「用户看到的文字」：链接标记在阅读态已隐藏，拖影里也不该露出 `[[ ]]`。
    const text = fv.value.trim() ? stripLinks(fv.value) : def.name
    if (!text.trim()) return null
    const kind: 'example' | 'plain' = leafForm(def.key) === 'example' ? 'example' : 'plain'
    return { text, kind }
  })()

  return (
    <div
      onMouseLeave={() => setHoveredId(null)}
      style={{
        opacity: fadeIn ? 1 : 0,
        transition: 'opacity var(--duration-fast) var(--ease-smooth)',
        height: '100%',
        overflowY: 'auto',
        background: 'var(--color-surface)',
      }}
    >
      {/* 工作台浮层点外关闭：全屏透明遮罩（＋ 添加菜单） */}
      {addMenu && (
        <div
          className="fixed inset-0"
          style={{ zIndex: 'var(--z-base)' }}
          onClick={() => setAddMenu(null)}
        />
      )}
      {/* 词条导航条（v0.5.2 §6；v0.7.2 缺陷 2 改为通栏）：移出 900 内容列，横贯整个右侧区域。
          sticky 贴在滚动区上缘、常驻不动——与复习区导航条同结构（导航条在内容列之外）。
          v0.7.2 二轮：**wrapper 不再垫左右内边距**——先前垫的 ENTRY_COLUMN_PADDING_X(24px)
          把导航条自己的 borderBottom 一起内缩，于是那条分割线左右各短 24px、顶不到屏幕
          边缘（用户：「分割线在左右两侧并没有顶到左边和右边」）。wrapper 通栏、导航条自身
          另持 14px 内边距（WorkbenchNavBar.tsx 的 `padding:'0 14px'`）撑内容位置，条的
          内容因此仍居中不跳。
          复习区正解在 ReviewModule.tsx:152（sticky 块无水平内边距，ArenaNavBar 的线通栏）。 */}
      {/* 手机外壳（Task 4）：`chrome="mobile"` 时整条不渲染——顶栏动作归 `MobileAppBar`（Task 5），
          两条导航条叠在一起会让每个动作出现两次。其余外壳（桌面）逐字不变。 */}
      {chrome === 'desktop' && (
        <div style={{ position: 'sticky', top: 0, zIndex: 'var(--z-sticky)',
                      background: 'var(--color-chrome)' }}>
          <WorkbenchNavBar
            region="workbench"
            // 移入 / 移回（v0.7.5 Task 11）：导航条保持哑组件，模块与回调动词由这里传入。
            location={location}
            onMoveWord={() => { void handleMoveWord() }}
            onDeleteWord={handleDelete}
            // 编辑态的保存 / 取消（v0.7.4 任务 14）：`editing` 有值才出现。`dirty` 本版只作
            // 将来的「未保存」提示，不据此禁用按钮（见 WorkbenchNavBar 的 prop 注释）。
            // 手机外壳（Task 5）复用这同一对回调，见上方 `useImperativeHandle`。
            editing={editingId ? { dirty: hasFieldChanges(editValue, entryValue) } : undefined}
            onSaveEdit={saveEdit}
            onCancelEdit={cancelEdit}
          />
        </div>
      )}

      {/* 内容列（上半：词条头带）：保持居中；列宽与左右内边距取 lib/layout 的共享常量。
          页签条带在手机外壳下移出内容列（见下方），故内容列拆成上下两段——
          上段只包头带，下段从页签条之后接正文并带上原有的 40px 底距。 */}
      <div style={{ maxWidth: `${ENTRY_BAND_WIDTH}px`, margin: '0 auto', padding: `0 ${ENTRY_COLUMN_PADDING_X}px` }}>

        {/* 词条头带（v0.7.3）：词头 + 喇叭一行，分类胶囊走头带行右端 rightCluster；
            音标走 rows（末行），词根走 footLeft——与最后一行右端 bottomRight（顽固词 + 记忆强度）
            并成一行。leechCount 按 isLeech(maxLapses, threshold) 门控——见组件体内那个常量。 */}
        <EntryBand
          headword={selectedWord.lemma}
          rule={false}
          savedMark={saved ? (
            // 保存确认条（v0.7.2 恢复；Task 2 Ruling 12 把「保存脉冲条」的动画换成了同一元素上的
            // background-color 过渡，故留下的是**确认**）：4×24 品牌色竖条，500ms 后由上面的 effect 收起。
            <span
              aria-hidden="true"
              style={{
                width: '4px', height: '24px', background: 'var(--color-brand)', borderRadius: '2px', flexShrink: 0,
                transition: 'background-color var(--duration-fast) var(--ease-smooth)',
              }}
            />
          ) : undefined}
          rightCluster={
            <>
              {shownCapsules.map(cat => (
                <CategoryCapsule key={cat.id} category={cat} onClick={() => openEditor(cat, selectedWord.id)} touch={touch} />
              ))}
              {showMoreCapsules && (
                <button
                  type="button"
                  title={capsuleExpanded ? '收起分类' : '展开更多分类'}
                  aria-label={capsuleExpanded ? '收起分类' : '展开更多分类'}
                  onClick={() => setCapsuleExpanded(v => !v)}
                  style={{
                    height: '24px', padding: '0 10px', borderRadius: 'var(--radius-full)',
                    border: '1px dashed var(--color-border-strong)', background: 'transparent',
                    fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)',
                    cursor: 'pointer', fontFamily: 'var(--font-sans)',
                    transition: 'color var(--duration-fast) var(--ease-smooth), border-color var(--duration-fast) var(--ease-smooth)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text-primary)'; e.currentTarget.style.borderColor = 'var(--color-text-primary)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; e.currentTarget.style.borderColor = 'var(--color-border-strong)' }}
                >
                  {capsuleExpanded ? '收起' : `+${extraCapsules.length}`}
                </button>
              )}
              {showMoreCapsules && capsuleExpanded && extraCapsules.map(cat => (
                <CategoryCapsule key={cat.id} category={cat} onClick={() => openEditor(cat, selectedWord.id)} touch={touch} />
              ))}
              {/* 「+」虚线圆钮：新建/选择分类（规格 §5.1）。v0.7.7 Task 10：手机上补 44dp 命中区。 */}
              <button
                type="button"
                title="添加分类"
                aria-label="添加分类"
                onClick={() => { openAssign(selectedWord.id); setCapsuleExpanded(false) }}
                style={{
                  width: `${BAND_CONTROL_SIZE}px`, height: `${BAND_CONTROL_SIZE}px`, border: '1px dashed var(--color-border-strong)',
                  borderRadius: 'var(--radius-full)', background: 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  color: 'var(--color-text-tertiary)',
                  transition: 'color var(--duration-fast) var(--ease-smooth), border-color var(--duration-fast) var(--ease-smooth)',
                  // 覆盖层的定位基准只在手机加；桌面样式逐字不变。
                  ...(touch ? { position: 'relative' as const } : null),
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text-primary)'; e.currentTarget.style.borderColor = 'var(--color-text-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; e.currentTarget.style.borderColor = 'var(--color-border-strong)' }}
              >
                {touch && (
                  // 44×44 命中区（v0.7.7 Task 10）：绝对定位、不进布局；挂在按钮**内部**，
                  // 点击冒泡回本按钮的 onClick。无 z-index：不盖过按钮自身。
                  <span aria-hidden="true" style={{ ...hitAreaStyle(), top: BAND_HIT_OFFSET, left: BAND_HIT_OFFSET }} />
                )}
                <Icon name="plus" size={16} />
              </button>
            </>
          }
          rows={
            // 只有音标行留在 `rows`（v0.7.3 尾段）：词根行挪进 `footLeft`，与末行右端的
            // 顽固词 · 记忆强度并成一行。词根的上间距因此归 `ENTRY_BAND_FOOT_GAP`（见下）。
            <div style={{ marginTop: `${ENTRY_PHONETIC_GAP}px` }}>
              <PhoneticArea
                values={phoneticValues.filter(fv => fv.id === editingId || fv.value.trim())}
                editorMode={editorMode}
                editingId={editingId}
                editValue={editValue}
                onEditValueChange={setEditValue}
                onStartEdit={handleStartEdit}
                onSave={handleSave}
                onCancelEdit={() => setEditingId(null)}
                onAdd={() => handleAddField(defs.find(d => d.key === 'phonetic')!)}
                onDelete={handleDeleteField}
                label="音标"
                touch={touch}
              />
            </div>
          }
          // 末行左端（v0.7.3 尾段）：词根行。**不持自己的 marginTop**——它与 `bottomRight`
          // 并成一行，那行的上间距由头带的 ENTRY_BAND_FOOT_GAP 统一给；这里再写一个
          // ENTRY_ROW_GAP 会与头带那份叠成 23px。
          // 注：`PhoneticArea` 的根 div 是 `display:flex` 且**不设 width**，作为 flex 项按
          // `flex: 0 1 auto` 收缩到内容宽度——词根文本长到放不下时会折行，不会把右簇挤出此行。
          footLeft={
            <PhoneticArea
              values={selectWordRootItems(wordRootValues, editingId, editorMode)}
              editorMode={editorMode}
              editingId={editingId}
              editValue={editValue}
              onEditValueChange={setEditValue}
              onStartEdit={handleStartEdit}
              onSave={handleSave}
              onCancelEdit={() => setEditingId(null)}
              onAdd={handleAddWordRoot}
              onDelete={handleDeleteField}
              label="词根"
              addLabel="+ 添加词根"
              plain
              stacked
              touch={touch}
            />
          }
          bottomRight={
            <>
              {leechCount !== undefined && (
                <>
                  <span aria-hidden="true"><LeechBadge count={leechCount} compact /></span>
                  <span>顽固词 · {leechTooltip(leechCount)}</span>
                </>
              )}
              {strengthNode && <><span>记忆强度</span>{strengthNode}</>}
            </>
          }
        />

        {/* 标签页条带（Task 3 TabBar）：标题区之下、内容区之上。编者模式页签右端现出 ×（删标签页）。
            手机外壳（Task 4）：条面放在内容列**之外**、**贯穿整个横向范围**——页签区在条内
            横向滚动，「＋」常驻右端（用户裁定）。桌面仍包进 900px 内容列，几何逐字不变。 */}
      </div>
      <div style={{
        maxWidth: chrome === 'mobile' ? undefined : `${ENTRY_BAND_WIDTH}px`,
        margin: '0 auto',
        // 桌面：与内容列同一份左右内边距（条面宽度 852、左缘与正文对齐，几何逐字不变）。
        // 手机：不给内边距，条面铺满视口宽度（通栏）。
        ...(chrome === 'mobile' ? null : { padding: `0 ${ENTRY_COLUMN_PADDING_X}px` }),
      }}>
        <TabBar
          tabs={tabs}
          activeTab={effectiveTab ?? 'main'}
          missing={missing}
          onSelect={setActiveTab}
          onAddTab={handleAddTab}
          onDeleteTab={handleDeleteTab}
          editorMode={editorMode}
          touch={touch}
        />
      </div>

      {/* 内容列（下半：正文流 → 反链 → 页级「＋ 添加」）：与上段同一度量与左右内边距；
          底距 40px 仍留在这一段（`ENTRY_COLUMN_PADDING` 的原值）。 */}
      <div style={{ maxWidth: `${ENTRY_BAND_WIDTH}px`, margin: '0 auto', padding: `0 ${ENTRY_COLUMN_PADDING_X}px 40px` }}>

        {/* 字段列表：一条正文流（SenseFlow）。组内行由 FieldCard 产出 FlowRow。
            v0.7.2 修复 3：显式给 measure = ENTRY_BAND_WIDTH，与返回页（DictDetailCard）同值同理由
            ——正文右缘与头带 / 页签条齐平，两页共用一个正文度量（不再一页 660 一页 900）。 */}
        <DndContext
          // 手机：只挂 TouchSensor（长按激活）；桌面：`undefined` → DndContext 用默认
          // Pointer + Keyboard，既有鼠标拖拽与键盘拖拽逐字不变（v0.7.7 Task 6）。
          sensors={touch ? sensors : undefined}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {/* v0.7.3 尾段 §4.1：上间距 8 → 4。与返回页（SenseFlow 的 paddingTop 4 + 首个头的 4）合起来，
              「页签条下缘 → 首个词性头」两页都是 12px（先前是 26 与 34）。
              headRule={1}（v0.7.5 修正）：`SenseFlow` 的 pos 头分支与返回页共用；返回页的标题分割线
              加粗到 2px 时，随它一起变粗的还有工作区平铺标签页（短语 / 词形变化 / 词源相关词 /
              近义词辨析）的头。工作区这一侧维持 1px，2px 只属于返回页。 */}
          <div style={{ marginTop: '4px' }}>
            {flowGroups.length > 0
              ? <SenseFlow groups={flowGroups} measure={ENTRY_BAND_WIDTH} headRule={1} />
              : (
                <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                  该词条暂无内容，可通过下方「＋ 添加」添加词性/短语等标签页
                </div>
              )}
          </div>
          {/* 拖拽副本（v0.7.4 任务 16）：DragOverlay 自己跟随指针，副本只画内容。
              `dragGhost` 已按 activeDragId 解析好；解析不到时为空，overlay 不渲染任何东西。 */}
          <DragOverlay>
            {dragGhost && <DragGhost text={dragGhost.text} kind={dragGhost.kind} />}
          </DragOverlay>
        </DndContext>

        {/* 反链脚注（v0.7.5 Task 6）：正文流之后、页级「＋ 添加」之上。空结果显示 null，
            故没有来源的词条看不到这一节，也不会留下一段空白。 */}
        <BacklinksFootnote lemma={selectedWord.lemma} />

        {/* 页级「＋ 添加」（v0.7.2 D7）：流末尾一个中性按钮，点开本标签页全部可加项 + 新建标签页 / 词根 / 音标。
            与正文流同度量（ENTRY_BAND_WIDTH），不像头带那样铺满。
            v0.7.2 修复 3：度量由 ENTRY_MEASURE（660）改成 ENTRY_BAND_WIDTH（900）——正文流的
            SenseFlow 与返回页同一判据，右缘与头带 / 页签条齐平。660 那一档是旧设计意图
            （「宽窗不放大正文」），已由 controller 裁定为返回页在与，两页不再各持一个度量。
            hover 走凹陷档：按钮底是 raised（95.1），共享的 --color-surface-hover（95.0）压上去只有
            0.13 L*、看不出反馈（评审 Important 2）；--color-surface-hover-recessed 离 raised 2.81 L*。 */}
        <div style={{ position: 'relative', maxWidth: `${ENTRY_BAND_WIDTH}px`, marginTop: '20px' }}>
          <button
            type="button"
            onClick={() => {
              // 手机（v0.7.7 fix Important 3）：页级添加同样走 grid 底部表；
              // 桌面仍开原位 AddMenu 弹层，逐字不变。
              if (touch) { openPageAddSheet(); return }
              setAddMenu(prev => prev?.target === 'page' ? null : { target: 'page' })
            }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
              background: 'var(--color-surface-raised)', color: 'var(--color-text-primary)',
              fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)',
              transition: 'background-color var(--duration-fast) var(--ease-smooth)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover-recessed)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-surface-raised)' }}
          >
            <Icon name="plus" size={16} />
            添加
          </button>
          {addMenu?.target === 'page' && (
            <div style={{ position: 'absolute', left: 0, bottom: 'calc(100% + 6px)', zIndex: 'var(--z-dropdown)' }}>
              <AddMenu title={tabLabel ? `添加到「${tabLabel}」` : '添加'} items={pageAddItems} extra={pageAddExtra} />
            </div>
          )}
        </div>
      </div>

      {/* 行级底部动作表（v0.7.7 Task 5）：只有手机路径会置位 `sheet`；桌面恒为 null，
          组件在 `open=false` 时返回 null，故桌面 DOM 与改动前一致。遮罩 / 取消 / 安卓返回键
          三条关闭路径都由组件自己登记（registerMobilePopup），这里只负责清 state。 */}
      <MobileActionSheet
        open={sheet !== null}
        title={sheet?.title}
        items={sheet?.items}
        mode={sheet?.mode ?? 'list'}
        onPick={handleSheetPick}
        onCancel={() => setSheet(null)}
      />
    </div>
  )
})

export default WordWorkbench
