import { useState, useEffect, useCallback, type CSSProperties } from 'react'
import {
  DndContext,
  pointerWithin,
  useDraggable,
  useDroppable,
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
import { fieldState, type FieldState } from '../../lib/fieldState'
import { Button } from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import Tooltip from '../ui/Tooltip'
import WordMasteryTooltip from '../ui/WordMasteryTooltip'
import ContextMenu, { type MenuItem } from '../ui/ContextMenu'
import Icon from '../icons'
import CategoryCapsule from './CategoryCapsule'
import PhoneticArea from './PhoneticArea'
import TabBar from './TabBar'
import WorkbenchNavBar from './WorkbenchNavBar'
import EntryBand from '../entry/EntryBand'
import SenseFlow from '../entry/SenseFlow'
import type { SenseGroup } from '../entry/SenseFlow'
import FlowRow from '../entry/FlowRow'
import RowActions, { rowIconStyle } from '../entry/RowActions'
import SourceMark from '../entry/SourceMark'
import AddMenu, { menuItemStyle, menuItemHover, type AddItem } from '../entry/AddMenu'
import { useCategoryStore } from '../../stores/categoryStore'
import { useReviewOverlayStore } from '../../stores/reviewOverlayStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { isLeech } from '../../lib/review/leech'
import { masteryBlocks, MASTERY_COLORS } from '../../lib/review/masteryScale'
import { displayTier } from '../../lib/review/mastery'
import { useUiStore } from '../../stores/uiStore'
import { ENTRY_BAND_WIDTH, ENTRY_COLUMN_PADDING } from '../../lib/layout'
import type { FieldDefinition, FieldValue } from '../../types/field'

/**
 * 一行的来源三态取色（v0.7.2，取代 v0.6.5 的 `fieldPaneLeftBar`）。
 *
 * 普通模式一律中性：来源三态是**编者视角**的信息，普通模式下并排显示会让同一个词条里的
 * 各行颜色不一致，读起来像两种东西。编者模式才按来源三态现形——与 `SourceMark` / `SourceBar` 同判据。
 * 词性窗格（`isPosPane`）永远中性：它是词性→释义树的结构节点，不参与来源三态
 * （旧 `fieldPaneLeftBar` 的这条不变量原样保留）。
 */
export function rowSourceState(editorMode: boolean, isPosPane: boolean, fv: FieldValue): FieldState {
  if (!editorMode || isPosPane) return 'original'
  return fieldState(fv)
}

// 左端 gutter 宽度（v0.5.2 修订）：手柄宽 10px，不额外留余量。
// 宽度写死的意义是「手柄显隐不改变文字区宽度」→ 零重排。
const GUTTER_WIDTH = 10

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
// 项类型字段（#4）：标签列不渲染字段名，值占满整行
const ITEM_FIELD_KEYS = ['exchange_item', 'supplementary_item', 'phrase_item', 'derivatives_item', 'synonym_item', 'example', 'word_root_item', 'synonym_discrimination_item']

interface InsertIndicator {
  overId: string
  before: boolean
}

// 「＋ 添加」菜单的打开状态：页级一处、行级一处（同一时刻至多一个）
type AddMenuState = { target: 'page' } | { target: 'row'; id: string } | null

interface FieldCardCtx {
  defs: FieldDefinition[]
  editorMode: boolean
  editingId: string | null
  editValue: string
  insertIndicator: InsertIndicator | null
  addMenu: AddMenuState
  onStartEdit: (fv: FieldValue) => void
  onEditValueChange: (value: string) => void
  onSave: () => void
  onCancelEdit: () => void
  onDelete: (fv: FieldValue) => void
  onAddSibling: (fv: FieldValue) => void
  onToggleAddMenu: (fv: FieldValue) => void
  onPickAdd: (containerFv: FieldValue, def: FieldDefinition) => void
  hoveredId: string | null
  onHover: (id: string | null) => void
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

/**
 * 行尾「⋯」菜单（v0.7.2）：两枚 22px 方钮里的第二枚。`RowActions` 只出 `＋` 与一个 `menu` 槽，
 * 故这里自带 `⋯` 触发器，点开走现成的 `ContextMenu`（fixed 落位，点外 / Esc 自关）。
 * 条目与编者 / 普通两模式同一套：编辑 / 添加同级 / 删除（先前编者模式单露红桶）。
 */
function RowMenu({ items }: { items: MenuItem[] }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  return (
    <>
      <button
        type="button"
        title="更多操作"
        aria-label="更多操作"
        onClick={e => setPos({ x: e.clientX, y: e.clientY })}
        style={rowIconStyle}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text-primary)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'inherit' }}
      >
        <Icon name="more" size={16} />
      </button>
      {pos && <ContextMenu x={pos.x} y={pos.y} items={items} onClose={() => setPos(null)} />}
    </>
  )
}

// 单个字段行（v0.7.2 改用原语外壳）：grip 拖拽（仅 grip 激活拖拽）+ 同级插入指示线 + 行尾操作簇。
// 旧代码里「卡片容器 + 左条 + 三态徽章 + 角落控件」的四层圆角嵌套，换成 FlowRow + SourceMark + RowActions。
function FieldCard({ fv, depth, parentFv, labelOverride, no, asGroupHead = false, ...ctx }: FieldCardProps) {
  const {
    defs, editorMode, editingId, editValue, insertIndicator, addMenu,
    onStartEdit, onEditValueChange, onSave, onCancelEdit, onDelete, onAddSibling,
    onToggleAddMenu, onPickAdd, hoveredId, onHover,
  } = ctx
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: fv.id })
  const { setNodeRef: setDropRef } = useDroppable({ id: `drop-${fv.id}` })
  const setRefs = useCallback((node: HTMLElement | null) => {
    setNodeRef(node)
    setDropRef(node)
  }, [setNodeRef, setDropRef])

  const def = defs.find(d => d.id === fv.fieldId)
  if (!def) return null

  const hasChildren = !!(fv.children && fv.children.length > 0)
  const isContainer = CONTAINER_FIELD_KEYS.includes(def.key)
  // 标签列文本（#4）：项类型字段不渲染字段名，值占满整行；词性子级用 override
  const labelText = labelOverride ?? (ITEM_FIELD_KEYS.includes(def.key) ? '' : def.name)
  const isPosPane = def.key === 'part_of_speech'
  const isGroupPane = def.key === 'synonym_discrimination_group'
  const isEditing = editingId === fv.id
  const isLevel1 = depth === 0
  const isPhonetic = def.key === 'phonetic'
  // 例句叶子（v0.7.2 缺陷 3）：只认 `example` 这一个键（容器 `example_sentence` 不在此列），
  // 走返回页那套「衬线斜体 + 行首 – 」的排版。
  const isExample = def.key === 'example'
  const state = fieldState(fv)
  // 来源三态取色（v0.7.2）：普通模式 / 词性窗格一律中性；只有编者模式下的非词性行才现形。
  const rowState = rowSourceState(editorMode, isPosPane, fv)

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
  // v0.7.2 §1.1：投影已全站摘除，拖拽反馈只剩轻微放大（scale 保留——它是拖拽态的位移提示，
  // 不是 §1.4 要删的「按压」缩放）。
  const draggingStyle = isDragging ? { transform: 'scale(1.02)' } : null

  // 拖拽手柄（左端 gutter）：FlowRow 行与 run-in 头共用。宽度固定 10px，手柄显隐不改变文字区宽度 → 零重排。
  const grip = (
    <span style={{ width: GUTTER_WIDTH, flexShrink: 0, alignSelf: 'center', display: 'inline-flex', alignItems: 'center' }}>
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...listeners}
        {...attributes}
        title="拖动排序"
        aria-label="拖动排序"
        style={{
          width: '10px', height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: 'none', background: 'transparent', borderRadius: 'var(--radius-sm)',
          cursor: isDragging ? 'grabbing' : 'grab', color: 'var(--color-text-tertiary)',
          flexShrink: 0, alignSelf: 'center', touchAction: 'none', ...reveal(showsButtons),
        }}
      >
        <Icon name="grip" size={10} />
      </button>
    </span>
  )

  // 行尾菜单条目：编辑 / 添加同级 / 删除。普通与编者同一套（先前编者模式单露红桶）。
  // 容器（非词性 / 非辨析组）无值格可编辑，不出「编辑」。
  const menuItems: MenuItem[] = [
    ...((!isContainer || isPosPane || isGroupPane)
      ? [{ key: 'edit', label: '编辑', onSelect: () => onStartEdit(fv) }]
      : []),
    { key: 'sibling', label: '添加同级', onSelect: () => onAddSibling(fv) },
    { key: 'delete', label: '删除', danger: true, onSelect: () => onDelete(fv) },
  ]

  // ②a：子项渲染（v0.7.2 缺陷 5/6 后不再分「终端 / 非终端」两档间距，也不再逐层缩进——
  // 两档都收成 marginTop:0，由 FlowRow 的悬挂缩进统一表达层级）。
  const childCounters = { zh: 0, en: 0 }
  const renderedChildren = hasChildren
    ? fv.children!.map(child => (
        <FieldCard
          key={child.id} fv={child} depth={depth + 1} parentFv={fv}
          labelOverride={childLabelOverride(def.key, childKey(child), child, childCounters)}
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
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', padding: '2px 0 2px 11px' }}>
      {grip}
      {isPosPane && isEditing ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <input
            className="px-3 py-1.5 rounded text-sm"
            style={{ border: '1px solid var(--color-brand)', color: 'var(--color-text-primary)', background: 'var(--color-surface)', maxWidth: '240px' }}
            value={editValue}
            onChange={e => onEditValueChange(e.target.value)}
            autoFocus
          />
          <Button onClick={onSave}>保存</Button>
          <Button variant="secondary" onClick={onCancelEdit}>取消</Button>
        </span>
      ) : isPosPane ? (
        <span
          onClick={() => editorMode && onStartEdit(fv)}
          onDoubleClick={() => !editorMode && onStartEdit(fv)}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStartEdit(fv) } }}
          title={editorMode ? '点击编辑词性标签' : '双击编辑词性标签'}
          style={{ ...headLabelStyle, cursor: 'pointer' }}
        >
          {fv.value}
        </span>
      ) : (
        <span style={headLabelStyle}>{def.name}</span>
      )}
      {!isEditing && headCounts !== undefined && (
        <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{headCounts}</span>
      )}
      <span style={{ flex: 1, borderTop: '1px solid var(--color-border)', transform: 'translateY(-3px)' }} />
      <span style={{ alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
        <SourceMark state={rowState} />
        <RowActions
          visible={showsButtons}
          onAdd={() => onToggleAddMenu(fv)}
          menu={<RowMenu items={menuItems} />}
        />
      </span>
    </div>
  )

  // 正文内容槽：标签 / 值。词性窗格的内容（POS 标签 + 中英计数）改由 run-in 头承担
  // （词性窗格一律作组的头渲染，见 groupHead），故此处不再有词性分支。
  const content = (
    <>
      {labelText && (
        <span
          // 编辑态时整组手势让位：input / 保存 / 取消都是本 span 的 DOM 子节点，而 Button
          // 不阻断冒泡（Button.tsx 把 onClick 原样 {...props} 透传）。点「取消」会先
          // setEditingId(null)、再被冒泡上来的这次点击 handleStartEdit 拉回编辑态并把
          // 输入回滚成已存值，按钮看上去完全失灵。故编辑态干脆不挂 click 监听器。
          onClick={isGroupPane && !isEditing ? () => onStartEdit(fv) : undefined}
          onDoubleClick={isGroupPane && !isEditing ? () => onStartEdit(fv) : undefined}
          role={isGroupPane && !isEditing ? 'button' : undefined}
          tabIndex={isGroupPane && !isEditing ? 0 : undefined}
          onKeyDown={isGroupPane ? e => {
            if (e.target !== e.currentTarget) return
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStartEdit(fv) }
          } : undefined}
          title={isGroupPane ? (editorMode ? '点击编辑辨析组标题' : '双击编辑辨析组标题') : undefined}
          style={{
            minWidth: LABEL_COLUMN_WIDTH, flexShrink: 0,
            fontSize: isLevel1 ? 'var(--text-sm)' : 'var(--text-xs)',
            fontWeight: 700, letterSpacing: '0.5px', color: 'var(--color-text-secondary)',
            cursor: isGroupPane ? 'pointer' : undefined,
          }}
        >
          {isGroupPane && isEditing ? (
            // 容器分支不渲染值格，但组标题带描述值：编辑态必须就地长出输入框。
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <input
                className="px-3 py-1.5 rounded text-sm"
                style={{ border: '1px solid var(--color-brand)', color: 'var(--color-text-primary)', background: 'var(--color-surface)' }}
                value={editValue}
                onChange={e => onEditValueChange(e.target.value)}
                autoFocus
              />
              <Button onClick={onSave}>保存</Button>
              <Button variant="secondary" onClick={onCancelEdit}>取消</Button>
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
            color: editorMode && state === 'original' ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
            fontFamily: isPhonetic ? 'var(--font-phonetic)' : undefined,
          }}
        >
          {isEditing ? (
            <span style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {def.fieldType === 'multiline' ? (
                <textarea
                  className="w-full px-3 py-2 rounded text-sm resize-none min-h-[60px]"
                  style={{ border: '1px solid var(--color-brand)', color: 'var(--color-text-primary)', background: 'var(--color-surface)' }}
                  value={editValue}
                  onChange={e => onEditValueChange(e.target.value)}
                  autoFocus
                />
              ) : (
                <input
                  className="w-full px-3 py-1.5 rounded text-sm"
                  style={{ border: '1px solid var(--color-brand)', color: 'var(--color-text-primary)', background: 'var(--color-surface)' }}
                  value={editValue}
                  onChange={e => onEditValueChange(e.target.value)}
                  autoFocus
                />
              )}
              <span style={{ display: 'flex', gap: '8px' }}>
                <Button onClick={onSave}>保存</Button>
                <Button variant="secondary" onClick={onCancelEdit}>取消</Button>
              </span>
            </span>
          ) : (
            <span
              onClick={() => editorMode && onStartEdit(fv)}
              onDoubleClick={() => !editorMode && onStartEdit(fv)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStartEdit(fv) } }}
              role="button"
              tabIndex={0}
              title={editorMode ? '点击编辑' : '双击编辑'}
              style={{ cursor: 'pointer' }}
            >
              {isExample ? (
                // 例句（v0.7.2 缺陷 3）：与搜索返回页同一处理（DictDetailCard 的 `example` 分支）——
                // 衬线斜体 14px/1.65 次级色，行首一枚 `–` 短破折号作分条标识（showcase-v2:197-198）。
                <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '14px', lineHeight: 1.65, color: 'var(--color-text-secondary)' }}>
                  <span style={{ color: 'var(--color-border-strong)', marginRight: '8px' }}>–</span>{fv.value}
                </span>
              ) : fv.value}
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
        />
      )}

      {/* 行体：组的根容器走 run-in 头（groupHead）；其余行走 FlowRow
          （来源条 / 义号 / 正文 / 行尾槽，行尾槽 = 来源标 + 操作簇，常驻占位）。 */}
      <div style={{ position: 'relative' }}>
        {asGroupHead ? groupHead : (
          <FlowRow
            no={no}
            state={rowState}
            end={
              <>
                <SourceMark state={rowState} />
                <RowActions
                  visible={showsButtons}
                  onAdd={() => onToggleAddMenu(fv)}
                  menu={<RowMenu items={menuItems} />}
                />
              </>
            }
          >
            <span style={{ display: 'flex', alignItems: 'baseline', gap: '4px', flex: 1, minWidth: 0 }}>
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
          {renderedChildren}
        </div>
      )}
    </div>
  )
}

export default function WordWorkbench() {
  const { words, selectedWordId, fieldValues, updateFieldValue, deleteWord, addFieldValue, deleteFieldValue, reorderFieldValues } = useWordStore()
  const [defs, setDefs] = useState<FieldDefinition[]>([])
  const editorMode = useViewStore(s => s.editorMode)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [entryValue, setEntryValue] = useState('')  // 进入编辑时的值
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [addMenu, setAddMenu] = useState<AddMenuState>(null)
  const [saved, setSaved] = useState(false)
  const [fadeIn, setFadeIn] = useState(true)
  const [insertIndicator, setInsertIndicator] = useState<InsertIndicator | null>(null)
  const [capsuleExpanded, setCapsuleExpanded] = useState(false)
  // 标签页记忆：用户停留的页；切换单词后若该页已不可见则经 effectiveTab 兜底回退到 defaultTab
  const [activeTab, setActiveTab] = useState<TabKey | null>(null)

  const { categories, wordCategoryIds, loadWordCategories } = useCategoryStore()
  const { openAssign, openEditor } = useUiStore()

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

  // 内联编辑点外关闭：点击编辑行外部且未改动时退出编辑（有改动保持，供继续编辑/保存）
  useEffect(() => {
    if (!editingId) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-field-edit]')) return   // 编辑行内（输入/保存/取消）不处理
      if (!hasFieldChanges(editValue, entryValue)) setEditingId(null)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [editingId, editValue, entryValue])

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
    if (editValue === entryValue) { setEditingId(null); return }  // 未真实修改：不置位
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

  const handleDelete = async () => {
    const ok = await useUiStore.getState().confirm({
      title: '删除单词',
      message: `确定删除单词“${selectedWord.lemma}”吗？此操作不可撤销。`,
      danger: true,
    })
    if (!ok) return
    await deleteWord(selectedWord.id)
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

  // 添加同级：与目标同 fieldId、挂到同一父下（根级则新增一个根容器）
  const handleAddSibling = async (fv: FieldValue) => {
    setAddMenu(null)
    const def = defs.find(d => d.id === fv.fieldId)
    if (!def) return
    const created = await addFieldValue(def.id, fv.parentId)
    if (!created) return
    if (CONTAINER_FIELD_KEYS.includes(def.key) && def.key !== 'synonym_discrimination_group' && def.key !== 'part_of_speech') return
    setEditingId(created.id)
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

  // 拖拽重排（规格 §5.5）：仅同级；拖动中行缩放+阴影，目标处 2px 品牌色插入线
  const handleDragStart = () => {
    setInsertIndicator(null)
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
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setInsertIndicator(null)
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
    editingId,
    editValue,
    insertIndicator,
    addMenu,
    onStartEdit: handleStartEdit,
    onEditValueChange: setEditValue,
    onSave: handleSave,
    onCancelEdit: () => setEditingId(null),
    onDelete: handleDeleteField,
    onAddSibling: handleAddSibling,
    onToggleAddMenu: (fv) => setAddMenu(prev => prev?.target === 'row' && prev.id === fv.id ? null : { target: 'row', id: fv.id }),
    onPickAdd: handleAddChild,
    hoveredId,
    onHover: setHoveredId,
  }

  const tabLabel = effectiveTab ? TAB_GROUPS[effectiveTab].label : ''
  // 正文流（SenseFlow）：字段列表走一条正文流。
  //  · 主标签页：**每个根容器一个组**，run-in 头就是该容器的头——词性窗格给出 POS 标签（衬线斜体）
  //    + 中/英计数，其余根容器（补充）用字段名；头里保留窗格自己的拖拽 / 编辑 / 行尾簇，子行（释义…）
  //    作义项行。这与返回页「每个顶层容器一个 run-in 头」的用法一致。
  //  · 平铺标签页：整体一个头（页签名），子项直接作义项行（与旧行为一致，根容器仍跳过）。
  // 每行连同其父节点一起带上——行尾「＋」要加到**本行所在容器**，叶子行的容器就是父节点。
  const flatRows: { fv: FieldValue; parentFv: FieldValue | null; depth: number }[] = sortedTabValues
    .flatMap(root => (root.children ?? []).map(child => ({ fv: child, parentFv: root, depth: isGroupTab ? 0 : 1 })))
  const flowGroups: SenseGroup[] = isFlatTab
    ? (flatRows.length > 0
        ? [{ pos: tabLabel, items: flatRows.map(({ fv, parentFv, depth }) => (
            <FieldCard key={fv.id} fv={fv} depth={depth} parentFv={parentFv} {...cardCtx} />
          )) }]
        : [])
    : sortedTabValues.map(root => {
        const counters = { zh: 0, en: 0 }
        const rootKey = keyOfFv(root)
        return {
          head: <FieldCard key={root.id} fv={root} depth={0} parentFv={null} asGroupHead {...cardCtx} />,
          items: (root.children ?? []).map(child => (
            <FieldCard
              key={child.id} fv={child} depth={1} parentFv={root}
              labelOverride={childLabelOverride(rootKey, keyOfFv(child), child, counters)}
              {...cardCtx}
            />
          )),
        }
      })

  // 页级「＋ 添加」菜单条目：本标签页全部可加项（沿用 addableLeafKeys 判据）+ 新建标签页 / 词根 / 音标
  const pageAddItems: AddItem[] = effectiveTab
    ? defs.filter(d => addableLeafKeys(effectiveTab).includes(d.key)).map(d => ({ key: d.id, label: d.name, onPick: () => handleAddField(d) }))
    : []
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

  // 头带里的字段行（音标 / 词根 / 分类）：与返回页同一形态。标签取设计稿 .frow .lb 的形式——
  // 62px 定宽列 / 11.5px / 常规字重 / 三级字色 / padding-top 2，与返回页 WordTitleExtras 的
  // LABEL_COL 逐项一致（评审 Minor M-1：两页曾一为 12px/700/次级、一为 11.5px/三级，看着不是一列）。
  // 各行 gap 同为 10px（设计稿 .frow 的 gap），与返回页 WordTitleExtras 一致（评审：改前 8px）。
  const bandRowLabel: CSSProperties = { width: '62px', flexShrink: 0, fontSize: '11.5px', color: 'var(--color-text-tertiary)', paddingTop: 2 }

  // 记忆强度（v0.7.2 缺陷 1）：头带（EntryBand）自带一枚「记忆强度」标签，故这里只给 5 格方块 +
  // 悬停明细——不再传带标签的 StrengthChip，否则「记忆强度」会印两遍。方块与浮层复用同一套共享件
  // （masteryBlocks / MASTERY_COLORS / displayTier / WordMasteryTooltip），与 StrengthChip 同源；
  // 本页只用「方块」这一半，带标签的整簇 StrengthChip 因此不再被引用。
  const masteryTier = displayTier({ stability: overlay?.weakestStability ?? null, familiarity: overlay?.familiarity ?? 1 })
  const mastery = masteryBlocks(masteryTier)
  const strengthNode = (
    <Tooltip content={<WordMasteryTooltip wordId={selectedWord.id} weakestStability={overlay?.weakestStability ?? null} familiarity={overlay?.familiarity ?? 1} />}>
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
      <div style={{ position: 'sticky', top: 0, zIndex: 'var(--z-sticky)',
                    background: 'var(--color-chrome)' }}>
        <WorkbenchNavBar region="workbench" onDeleteWord={handleDelete} />
      </div>

      {/* 内容列：保持居中；列宽与内边距取 lib/layout 的共享常量（ENTRY_BAND_WIDTH / ENTRY_COLUMN_PADDING） */}
      <div style={{ maxWidth: `${ENTRY_BAND_WIDTH}px`, margin: '0 auto', padding: ENTRY_COLUMN_PADDING }}>

        {/* 词条头带（v0.7.2）：词头 + 喇叭 + 顽固词 + 记忆强度；音标 / 词根 / 分类走 rows。
            leechCount 必须按 isLeech(maxLapses, threshold) 门控——overlay.maxLapses 对非顽固词是 0，
            直接传会把全库每个词都标成「连错 0 次」；门控属页面（它才拿得到设置）。 */}
        <EntryBand
          headword={selectedWord.lemma}
          leechCount={overlay && isLeech(overlay.maxLapses, leechThreshold) ? overlay.maxLapses : undefined}
          strength={strengthNode}
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
          rows={
            <>
              <div style={{ marginTop: '7px' }}>
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
                />
              </div>
              <div style={{ marginTop: '7px' }}>
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
                />
              </div>
              {/* 分类行（规格 §5.1）：分类胶囊 + 「+」新建/选择分类。行距 gap 取 10px（设计稿 .frow 的 gap，
                  showcase-v2:158/594；与返回页 WordTitleExtras 及上面两条 PhoneticArea 行同值）。 */}
              <div style={{ marginTop: '7px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <span style={bandRowLabel}>分类</span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {shownCapsules.map(cat => (
                    <CategoryCapsule key={cat.id} category={cat} onClick={() => openEditor(cat, selectedWord.id)} />
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
                    <CategoryCapsule key={cat.id} category={cat} onClick={() => openEditor(cat, selectedWord.id)} />
                  ))}
                  {/* 「+」虚线圆钮：新建/选择分类（规格 §5.1） */}
                  <button
                    type="button"
                    title="添加分类"
                    aria-label="添加分类"
                    onClick={() => { openAssign(selectedWord.id); setCapsuleExpanded(false) }}
                    style={{
                      width: '24px', height: '24px', border: '1px dashed var(--color-border-strong)',
                      borderRadius: 'var(--radius-full)', background: 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                      color: 'var(--color-text-tertiary)',
                      transition: 'color var(--duration-fast) var(--ease-smooth), border-color var(--duration-fast) var(--ease-smooth)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text-primary)'; e.currentTarget.style.borderColor = 'var(--color-text-primary)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)'; e.currentTarget.style.borderColor = 'var(--color-border-strong)' }}
                  >
                    <Icon name="plus" size={16} />
                  </button>
                </span>
              </div>
            </>
          }
        />

        {/* 标签页条带（Task 3 TabBar）：标题区之下、内容区之上。编者模式页签右端现出 ×（删标签页）。 */}
        <TabBar
          tabs={tabs}
          activeTab={effectiveTab ?? 'main'}
          missing={missing}
          onSelect={setActiveTab}
          onAddTab={handleAddTab}
          onDeleteTab={handleDeleteTab}
          editorMode={editorMode}
        />

        {/* 字段列表：一条正文流（SenseFlow）。组内行由 FieldCard 产出 FlowRow。
            v0.7.2 修复 3：显式给 measure = ENTRY_BAND_WIDTH，与返回页（DictDetailCard）同值同理由
            ——正文右缘与头带 / 页签条齐平，两页共用一个正文度量（不再一页 660 一页 900）。 */}
        <DndContext
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div style={{ marginTop: '8px' }}>
            {flowGroups.length > 0
              ? <SenseFlow groups={flowGroups} measure={ENTRY_BAND_WIDTH} />
              : (
                <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                  该词条暂无内容，可通过下方「＋ 添加」添加词性/短语等标签页
                </div>
              )}
          </div>
        </DndContext>

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
            onClick={() => setAddMenu(prev => prev?.target === 'page' ? null : { target: 'page' })}
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
    </div>
  )
}
