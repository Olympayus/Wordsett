import { useCallback, type CSSProperties, type ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { ROW_LINE_HEIGHT, ROW_PADDING_Y } from '../../lib/layout'
import { SourceBar } from './SourceMark'
import { DotMark } from './Mark'
import Icon from '../icons'
import type { FieldState } from '../../lib/fieldState'

/**
 * 短条目字段的一行多条（v0.7.3 §5.4）。
 *
 * 与 `FlowRow` 是兄弟：`FlowRow` 输出「一行一条」的义项行，本组件把同一容器下的兄弟叶子
 * 排成流式多列。每条前一枚「·」，与例句前的「–」是同一套语言——v0.7.4 起两枚都是**画**出来的
 * （`Mark.tsx`），不再是字体字形（字形的墨只有两三像素，来源色涂上去看不出差别）。
 *
 * `markColor` 是**数据**不是行为（v0.7.4 决定九）：本组件两页共用，颜色由调用页给——
 * 工作区在编者模式下按单位的来源态给、普通模式给三级色，返回页恒给三级色。LeafFlow 自己
 * 不读任何编辑器状态，保持哑组件。
 *
 * 用 flex-wrap 而不是固定列数：词长差异极大（`dine` 与 `clear: 清除（拉丁 clarus 明亮）`
 * 差三倍），固定列数会让短词后半列全空、长词被省略号截断；流式排法让长条目自己占满一行。
 *
 * 不参与编号：这类行本来就没有义号（`FlowRow` 的 `no` 不传），多列后也不引入。
 * 左缘与 `FlowRow` 一致（11px），故它仍是同一条正文流里的块。
 *
 * `items` 是 `{ content, end?, onEnter?, onLeave?, markColor, id? }[]`（v0.7.3 控制器裁决 P4、
 * 尾段 §3.4）：两个调用页各自把**今天渲染的那个节点**原样交进来——工作区传
 * `{ id: ch.id, content: ch.value, end: …, onEnter/onLeave, markColor }`（它的叶子行本就只渲染
 * `fv.value`），返回页传 `{ content: renderContent(c), markColor }`（保住 `标签: 值` 的拆写、
 * **不传 end / onEnter / onLeave / id**）。这样两页的文本渲染逐字不变，也不必再写第二份拆分实现。
 *
 * `end` 是**单位自己的行尾槽**（v0.7.3 尾段 §3.4）：每个单位一枚 22px 的操作簇
 * （近义词 → `⋯` 编辑 / 删除），绝对定位在本单位右缘之外那 22px 里。**必须绝对定位**——
 * 它一进排版流，悬停那一刻该单位就变宽、后继的词重新折行（与 v0.5.2 修过的行尾簇抖动同一个坑）。
 * 22px 正好等于栏距（`gap: '6px 22px'`），且按钮本身也是 22px（`NAV_CONTROL_HEIGHT`），一格一枚正好合上。
 *
 * `end` 是**条件渲染**的（有指针悬停的那一枚才非空），这在行尾槽里是安全的：该槽
 * `position: absolute`、完全不进排版流，无论出现还是消失都不会让任何东西重新折行
 * （与行尾操作簇「必须常驻占位、只用 opacity 显隐」的约束不冲突——那一条针对的是
 * **在流内**的控件；这里是流外的）。
 *
 * 单位悬停由 `items` 上的 `onEnter` / `onLeave` 回调驱动（缺省不传——返回页不传这两个
 * 回调，故其 DOM 与之前逐字相同）。`onLeave` 通常把 hover 交还容器行而不是清空，
 * 因为行的 `onMouseEnter` 在指针从行空白移到单位上时不会重发。
 *
 * **单位是一等公民（v0.7.4 任务 12）**：单位自己**注册拖拽 / 落点**（`id` / `drop-${id}`，
 * 与 `FieldCard` 注册一行时同一约定），故 `lib/dragReorder` 的判定逻辑一行不改——落点解析
 * 只看 id，单位本就是 `parentId` 指向容器的 `FieldValue`，注册即刻可拖。手柄挂在单位左缘之外
 * （`right: 100%`）、**只在悬停的那一刻现形**；它是流外绝对定位元素，出现 / 消失不占位、
 * 不动任何词的位置与折行点。单位正文**不接管拖拽**（手柄是唯一的激活点），双击（普通）/
 * 单击（编者）进编辑仍归 `·` 之后的正文。
 *
 * (b) **拖拽注册只在工作区**：`LeafFlow` 与返回页共用，而返回页 `DictDetailCard` **没有
 * `DndContext`**。`useDraggable` / `useDroppable` 在缺 `DndContext` 时其实**是惰性的**
 * （`InternalContext` 有非空默认值，`dispatch` 是 noop、不抛不警），但那样仍会把单位注册进
 * 默认上下文的共享 Map。故这里按「传没传 `drag`」渲染**两个变体**——`UnitItemPlain`（不调任何
 * hook）与 `UnitItemDraggable`（hook 写在组件体内、无条件调用）——由 `LeafFlow` 按 `drag` 选择，
 * 返回页因此一个 hook 都不触发、一次注册都不发生。绝不条件调用 hook。
 */
interface LeafFlowItem {
  /** 单位 id（v0.7.4 任务 12）：工作区传，供拖拽注册；返回页不传（拖拽不参与那里）。 */
  id?: string
  content: ReactNode
  end?: ReactNode
  onEnter?: () => void
  onLeave?: () => void
  markColor: string
}

/**
 * 单位手势（v0.7.4 任务 12）：**只有工作区传**，返回页不传——它的 `LeafFlow` 因此不注册拖拽。
 * 一律经 props 进来（LeafFlow 保持哑组件：不读 store、不读编辑器模式）。
 */
export interface LeafFlowDrag {
  /** 该单位当前是否被拖动（出选中框）。 */
  isDragging: (id: string) => boolean
  /** 悬停中的单位 id（决定哪一枚手柄现形）。 */
  hoveredId: string | null
  /** 落点指示（约束 a）：该单位是不是落点、插在其前还是后。 */
  indicator: { overId: string; before: boolean } | null
}

// 单位 span：流内的格。手柄 / 落点线都是它的流外绝对定位子节点，故 span 自身宽度只由内容决定。
const UNIT_SPAN: CSSProperties = {
  position: 'relative', minWidth: 0, fontSize: '15px', lineHeight: ROW_LINE_HEIGHT, color: 'var(--ink-2)',
}

// 手柄的流外 wrapper（v0.7.4 任务 12 修复）：覆盖单位左缘之外 `[-16, 0]`——按钮本体占 `[-16, -2]`，
// 那 2px 间距也落在 wrapper 内。wrapper 是 span 的 **DOM 后代**（几何上在 span 盒外无妨）：鼠标离开
// `mouseleave` 只按 DOM 层级判定，指针停在间距里时仍在 span 的子树内，故不会触发 span 的 `onMouseLeave`、
// 手柄也就不会在指针抵达前被卸载（原先那 2px 谁都不属于，是悬停死区）。wrapper 全程流外、不占位。
const UNIT_HANDLE_WRAPPER: CSSProperties = {
  position: 'absolute', right: '100%', top: 0, bottom: 0, width: '16px',
  display: 'flex', alignItems: 'center', justifyContent: 'flex-end', pointerEvents: 'auto',
}

// 按钮本体：宽 14px + 右间距 2px，与原来的手柄逐字同宽同图标；只是从绝对定位改为 wrapper 的 flex 子项，
// 好让那 2px 间距落进同一个 wrapper 里。
const UNIT_HANDLE: CSSProperties = {
  width: '14px', marginRight: '2px',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', background: 'transparent', borderRadius: 'var(--radius-sm)',
  cursor: 'grab', color: 'var(--color-text-tertiary)', touchAction: 'none',
}

/** 单位的格内容（两变体共用）：小点 + 正文 + 单位自己的行尾槽。 */
function unitBody(it: LeafFlowItem) {
  return (
    <>
      <span style={{ marginRight: '6px' }}><DotMark color={it.markColor} /></span>
      {it.content}
      {it.end && (
        <span style={{ position: 'absolute', left: '100%', top: 0, height: '100%',
                       width: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{it.end}</span>
      )}
    </>
  )
}

/**
 * 落点线（v0.7.4 任务 12 约束 a）：竖直 2px 品牌色，贯穿单位自身的盒高，`before` 贴 leading
 * 边缘、否则贴 trailing 边缘。落点判定仍是既有的纵向 `insertBefore`（`dragReorder.ts`），
 * 这里**只换呈现**、不改判定；流外 + `pointerEvents: none`，不进布局。
 */
function unitDropLine(before: boolean) {
  return (
    <span style={{ position: 'absolute', top: 0, bottom: 0, width: '2px',
                   background: 'var(--color-brand)', borderRadius: '1px', pointerEvents: 'none',
                   ...(before ? { left: '-2px' } : { right: '-2px' }) }} />
  )
}

/** 返回页（无 `DndContext`）的单位：不注册拖拽、无手柄、无选中框。 */
function UnitItemPlain({ it }: { it: LeafFlowItem }) {
  return (
    <span onMouseEnter={it.onEnter} onMouseLeave={it.onLeave} style={UNIT_SPAN}>
      {unitBody(it)}
    </span>
  )
}

/**
 * 工作区单位：自己注册拖拽 / 落点（`id` / `drop-${id}`，与 `FieldCard` 同一约定——两个 handler
 * 与 `lib/dragReorder` 因此一行不改）。手柄是**唯一**的拖拽激活点（`setActivatorNodeRef`），
 * 单位 span 只承接落点度量，不接管拖拽。
 */
function UnitItemDraggable({ id, it, drag }: { id: string; it: LeafFlowItem; drag: LeafFlowDrag }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef } = useDraggable({ id })
  const { setNodeRef: setDropRef } = useDroppable({ id: `drop-${id}` })
  // 两个 ref 合到同一个节点（与 FieldCard 同做法）。
  const setRef = useCallback((node: HTMLElement | null) => {
    setNodeRef(node)
    setDropRef(node)
  }, [setNodeRef, setDropRef])
  const focused = drag.isDragging(id)
  const ind = drag.indicator
  return (
    <span
      ref={setRef}
      onMouseEnter={it.onEnter}
      onMouseLeave={it.onLeave}
      style={{
        ...UNIT_SPAN,
        // 选中框（v0.7.4 任务 12）：与 FlowRow 的 `focused` 同款——内阴影 + 圆角 + 极轻品牌底，
        // **不参与布局**（内阴影画在 border 盒内侧、不进排版流，故不引起折行抖动）。
        ...(focused
          ? { boxShadow: 'inset 0 0 0 1px var(--color-brand)', borderRadius: 'var(--radius-md)',
              background: 'var(--color-brand-soft)' }
          : null),
      }}
    >
      {ind && ind.overId === id && unitDropLine(ind.before)}
      {/* 手柄只在悬停的那一刻现形——wrapper 是流外绝对定位元素，条件渲染安全（文件头已有的同款论证）。 */}
      {drag.hoveredId === id && (
        <span style={UNIT_HANDLE_WRAPPER}>
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...listeners}
            {...attributes}
            title="拖动排序"
            aria-label="拖动排序"
            style={UNIT_HANDLE}
          >
            <Icon name="grip" size={10} />
          </button>
        </span>
      )}
      {unitBody(it)}
    </span>
  )
}

export default function LeafFlow({ items, state = 'none', first = true, last = true, drag }: {
  items: LeafFlowItem[]
  state?: FieldState
  /** 整块是否是其所属段的**首块**（v0.7.4 决定八）：多单位块按一行参与分段。 */
  first?: boolean
  /** 整块是否是其所属段的**末块**。 */
  last?: boolean
  /** 单位手势（v0.7.4 任务 12）：工作区传、返回页不传（决定单位走哪个变体）。 */
  drag?: LeafFlowDrag
}) {
  return (
    <div style={{ position: 'relative', padding: `${ROW_PADDING_Y}px 0 ${ROW_PADDING_Y}px 11px` }}>
      <SourceBar state={state} first={first} last={last} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 22px' }}>
        {items.map((it, i) =>
          drag && it.id
            ? <UnitItemDraggable key={it.id} id={it.id} it={it} drag={drag} />
            : <UnitItemPlain key={it.id ?? i} it={it} />,
        )}
      </div>
    </div>
  )
}
