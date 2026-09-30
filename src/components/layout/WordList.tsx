import { useRef } from 'react'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useWordStore } from '../../stores/wordStore'
import { useCategoryStore } from '../../stores/categoryStore'
import { useViewStore } from '../../stores/viewStore'
import { useUiStore } from '../../stores/uiStore'
import { useReviewOverlayStore } from '../../stores/reviewOverlayStore'
import { useSettingsStore } from '../../stores/settingsStore'
import SidebarToolbar from './SidebarToolbar'
import SmartViewList from './SmartViewList'
import WordListItem from '../word/WordListItem'
import ContextMenu, { type MenuItem } from '../ui/ContextMenu'
import CategoryPickerPopover from '../ui/CategoryPickerPopover'
import { vocabularySearch } from '../../lib/search'
import { groupByLetter, groupByCategory, type SidebarMode } from '../../lib/sidebar'
import { rangeSelect, selectAll, pruneToRows, selectedWordIdsFromRows } from '../../lib/selection'
import { SMART_VIEW_ORDER, filterBySmartView, smartViewCount, visibleSmartViews } from '../../lib/smartViews'
import type { SmartViewKey } from '../../lib/smartViews'
import type { WordWithPreview } from '../../types/word'
import type { Category } from '../../types/category'
import Icon, { type IconName } from '../icons'

type HeaderType = 'letter' | 'category' | 'uncategorized'

interface HeaderRow {
  kind: 'header'
  key: string
  type: HeaderType
  label: string
  count: number
  color?: string
}
interface ItemRow {
  kind: 'item'
  key: string
  word: WordWithPreview
  categories: Category[]
}
type Row = HeaderRow | ItemRow

/**
 * 空态文案（v0.6.5 §4.4「空态文案」）。键是视图，值只说**该视图的口径**：
 * 复习到期 → 今天没有到期的词条 / 本周新增 → 近 7 天没有新增词条 / 顽固词 → 还没有达到
 * 阈值的顽固词。这三句与通用那句「没有匹配的单词」不是同一种话——后者会被读成
 * 「你筛错了」，而用户在复习到期视图里其实什么都没做错，只是今天没有到期的东西。
 * 「完整词库」留在通用那句：它下面空，本来就只可能是筛选框筛空了。
 */
const EMPTY_TEXT: Record<SmartViewKey, string> = {
  all: '没有匹配的单词',
  due: '今天没有到期的词条',
  weekNew: '近 7 天没有新增词条',
  leech: '还没有达到阈值的顽固词',
}

export default function WordList({
  collapsed,
  onToggleCollapse,
  mode,
  onToggleMode,
}: {
  collapsed: boolean
  onToggleCollapse: () => void
  mode: SidebarMode
  onToggleMode: () => void
}) {
  const { words, selectedWordId, selectWord } = useWordStore()
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchorKey, setAnchorKey] = useState<string | null>(null)
  const [batchPopover, setBatchPopover] = useState<'add' | 'remove' | null>(null)
  // 批量条那行——两个分类下拉浮层的锚点（浮层是 fixed 落位，锚点由它现算）
  const batchAnchorRef = useRef<HTMLDivElement>(null)
  const { assignMany, unassignMany } = useCategoryStore()
  const { deleteWords } = useWordStore()
  const { categories, wordCategoryMap } = useCategoryStore()
  const [filter, setFilter] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [searching, setSearching] = useState(false)
  const [filtered, setFiltered] = useState<WordWithPreview[]>(words)

  // 智能视图（v0.6.5 §4.4）：置顶四个固定视图，是**附加**在筛选框之上的一层，
  // 不改变下方列表的分组方式。
  const [smartView, setSmartView] = useState<SmartViewKey>('all')
  const smartViews = useSettingsStore(s => s.smartViews)
  const overlay = useReviewOverlayStore(s => s.overlay)
  const dueWordIds = useReviewOverlayStore(s => s.dueWordIds)
  const leechThreshold = useSettingsStore(s => s.review.leechThreshold)

  const viewInput = useMemo(() => ({ words, dueWordIds, overlay, leechThreshold, now: Date.now() }), [words, dueWordIds, overlay, leechThreshold])
  const viewCounts = useMemo(() => Object.fromEntries(
    SMART_VIEW_ORDER.map(k => [k, smartViewCount(k, viewInput)])) as Record<SmartViewKey, number>, [viewInput])
  // 在设置里关掉正在激活的视图 → 它从 visibleSmartViews 里消失，这里退回「完整词库」。
  // 刻意不写 state（不弹确认、不留一个指向隐藏视图的激活态）：派生的下一次渲染就落到 all。
  const activeView = visibleSmartViews(smartViews).includes(smartView) ? smartView : 'all'
  // 视图是附加筛选：先过视图，再过筛选框。
  const viewFiltered = useMemo(() => filterBySmartView(words, activeView, viewInput), [words, activeView, viewInput])

  // 空态取哪一句（§4.4）：**库本身就是空**时说什么都像在指责筛选，保留原那句引导去搜索框；
  // 否则只要有视图在生效就用它自己的口径——「完整词库」键的值就是通用那一句。
  const emptyText = words.length === 0 ? '词库为空，使用顶部搜索框添加单词' : EMPTY_TEXT[activeView]

  // 筛选：空串显示视图内的全部；非空走词库搜索（lemma + 字段值，沿用现状）
  useEffect(() => {
    if (!filter.trim()) { setFiltered(viewFiltered); return }
    setSearching(true)
    vocabularySearch(filter)
      .then(r => {
        // vocabularySearch 搜的是**全库**，不吃视图过滤，所以不能让搜索结果原样落进列表。
        // 方向只能是「先搜全库，再拿视图的允许集取交集」——反过来把 viewFiltered 喂进搜索
        // 会得到一个既不受筛选框约束也不受视图约束的结果集。
        const allowed = new Set(viewFiltered.map(w => w.id))
        setFiltered(r.filter(w => allowed.has(w.id)))
      })
      .finally(() => setSearching(false))
  }, [filter, viewFiltered])

  const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])

  // 右键菜单状态：单词菜单 / 分类菜单（分类组头右键）
  const [menu, setMenu] = useState<null
    | { x: number; y: number; kind: 'word'; word: WordWithPreview }
    | { x: number; y: number; kind: 'category'; category: Category }>(null)
  const showWorkbench = useViewStore(s => s.showWorkbench)
  const setEditorMode = useViewStore(s => s.setEditorMode)
  const { openAssign, openEditor } = useUiStore()
  const { deleteWord } = useWordStore()
  const { removeFromWord, deleteCategory } = useCategoryStore()

  const wordMenuItems = (word: WordWithPreview): MenuItem[] => {
    const cats = (wordCategoryMap[word.id] ?? [])
      .map(id => categoryById.get(id))
      .filter((c): c is Category => Boolean(c))
    return [
      { key: 'edit', label: '编辑', onSelect: () => { void selectWord(word.id); showWorkbench(); setEditorMode(true) } },
      { key: 'assign', label: '添加到…', onSelect: () => openAssign(word.id) },
      {
        key: 'remove', label: '从…中移除', disabled: cats.length === 0,
        children: [
          ...cats.map(c => ({ key: `rm-${c.id}`, label: c.name, onSelect: () => { void removeFromWord(word.id, c.id) } })),
          { key: 'more', label: '更多…', onSelect: () => openAssign(word.id) },
        ],
      },
      {
        key: 'delete', label: '删除单词', danger: true,
        onSelect: async () => {
          if (await useUiStore.getState().confirm({ title: '删除单词', message: `确定删除单词“${word.lemma}”吗？此操作不可撤销。`, danger: true })) void deleteWord(word.id)
        },
      },
    ]
  }

  const categoryMenuItems = (category: Category): MenuItem[] => [
    { key: 'edit', label: '编辑分类', onSelect: () => openEditor(category, null) },
    {
      key: 'delete', label: '删除分类', danger: true,
      onSelect: async () => {
        if (await useUiStore.getState().confirm({ title: '删除分类', message: `确定删除分类“${category.name}”吗？将从所有单词移除该分类。`, danger: true })) void deleteCategory(category.id)
      },
    },
  ]

  // 分组：字母模式按首字母；分类模式按分类（含「未分类」）
  const groups = useMemo(() => {
    if (mode === 'alphabet') {
      return groupByLetter(filtered).map(g => ({
        key: `letter:${g.letter}`, type: 'letter' as HeaderType, label: g.letter,
        count: g.words.length, color: undefined as string | undefined, words: g.words,
      }))
    }
    return groupByCategory(filtered, wordCategoryMap, categories).map(g => ({
      key: g.category ? `cat:${g.category.id}` : 'uncat',
      type: g.category ? 'category' as HeaderType : 'uncategorized' as HeaderType,
      label: g.category ? g.category.name : '未分类',
      count: g.words.length, color: g.category?.color, words: g.words,
    }))
  }, [mode, filtered, wordCategoryMap, categories])

  // 展平可见行：组头 + 展开组的单词项
  const rows = useMemo<Row[]>(() => {
    const rs: Row[] = []
    for (const g of groups) {
      rs.push({ kind: 'header', key: g.key, type: g.type, label: g.label, count: g.count, color: g.color })
      const folded = g.type !== 'uncategorized' && collapsedGroups.has(g.key)  // 未分类区不可折叠（§4.3）
      if (!folded) {
        for (const w of g.words) {
          const cats = (wordCategoryMap[w.id] || []).map(id => categoryById.get(id)).filter((c): c is Category => Boolean(c))
          rs.push({ kind: 'item', key: `${g.key}:${w.id}`, word: w, categories: cats })
        }
      }
    }
    return rs
  }, [groups, collapsedGroups, wordCategoryMap, categoryById])

  // 当前实际渲染的词条行键——全选与范围选的作用域就是它，不是全库。
  const wordRowKeys = useMemo(
    () => rows.filter((r): r is ItemRow => r.kind === 'item').map(r => r.key),
    [rows])

  // 批量动作的入参（纯函数在 lib/selection.ts，带回归锁）。
  // 由当前 rows 反查，所以不可见的键结构上产不出 id；同一词双归属时按 wordId 去重，
  // 使工具栏的「已选 N」与确认框的「N 个单词」说的是同一个数。
  const selectedWordIds = useMemo(
    () => selectedWordIdsFromRows(
      rows.flatMap(r => r.kind === 'item' ? [{ key: r.key, wordId: r.word.id }] : []),
      selected),
    [rows, selected])

  // 列表因筛选或视图切换而变化后，把已选中但已不可见的键剔掉。
  // 不做这一步，批量删除会删到用户已经看不见的词。
  useEffect(() => { setSelected(prev => pruneToRows(prev, wordRowKeys)) }, [wordRowKeys])

  // 锚点同样要跟着走：它是一个行键，所在行被筛掉后就是悬空的。
  // rangeSelect 在锚点缺失时退化成对目标的单点切换，不会拉出一条错误的范围——
  // 但把悬空锚点留在 state 里会让「筛选后再 Shift 点一下」的意图变得不可预期，故直接清空。
  useEffect(() => { setAnchorKey(prev => (prev !== null && !wordRowKeys.includes(prev) ? null : prev)) }, [wordRowKeys])

  const exitSelect = useCallback(() => {
    setSelectMode(false); setSelected(new Set()); setAnchorKey(null); setBatchPopover(null)
  }, [])

  useEffect(() => {
    if (!selectMode) return
    // 与本组件内其他 window 级 Esc 监听（词条卡浮层、词典返回页回工作台）不冲突：
    // 那些各自清自己的状态，这里只清选中集。**刻意不停冒泡**——在 selectMode 下 Esc
    // 唯一该发生的事就是退出选择模式。
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') exitSelect() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectMode, exitSelect])

  // 三个批量动作的入参都取自已剪枝的 selectedWordIds——它是「当前看得见的选中词」的唯一定义。
  const runBatchDelete = async () => {
    const ids = selectedWordIds
    if (ids.length === 0) return
    const ok = await useUiStore.getState().confirm({
      title: '删除单词',
      message: `确定删除选中的 ${ids.length} 个单词吗？此操作不可撤销。`,
      danger: true,
    })
    if (!ok) return
    await deleteWords(ids)
    exitSelect()
  }

  // 归类两动作都走 try/finally：写入失败时也要退出选择模式。
  // 否则一次 IPC 异常就把批量条和它的全屏遮罩留在屏幕上，用户只能靠点遮罩逃生。
  // runBatchDelete 的提前返回是刻意的（用户取消确认框时保留选择），那里不加 finally。
  const runBatchAssign = async (categoryId: string) => {
    try {
      await assignMany(selectedWordIds, categoryId)
    } finally {
      exitSelect()
    }
  }

  // 「从分类移除」只对确实属于该分类的选中项生效，其余静默跳过。
  // 传入的是「已剪枝后的可见选中词」∩「确实挂在这个分类下的词」：
  // 交集为空时直接短路，连 IPC 都不发（DB 侧 DELETE 本就按 category_id 过滤、天然幂等，
  // 这里先收窄是为了让「选了一堆不在这分类里的词」这个情形在语义上就是空动作）。
  const runBatchUnassign = async (categoryId: string) => {
    const ids = selectedWordIds.filter(id => (wordCategoryMap[id] ?? []).includes(categoryId))
    if (ids.length === 0) { exitSelect(); return }
    try {
      await unassignMany(ids, categoryId)
    } finally {
      exitSelect()
    }
  }

  const handleRowClick = (row: ItemRow, e: React.MouseEvent | React.KeyboardEvent) => {
    if (!selectMode) { void selectWord(row.word.id); showWorkbench(); return }
    if (e.shiftKey) { setSelected(prev => rangeSelect(wordRowKeys, anchorKey, row.key, prev)) }
    else {
      setSelected(prev => {
        const next = new Set(prev)
        if (next.has(row.key)) next.delete(row.key); else next.add(row.key)
        return next
      })
    }
    setAnchorKey(row.key)
  }

  const parentRef = useRef<HTMLDivElement>(null)
  const shouldVirtualize = rows.length > 100
  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? rows.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => {
      const r = rows[i]
      if (r.kind === 'item') return collapsed ? 32 : 76
      return 28
    },
    overscan: 6,
  })

  // 边栏筛选生效时（filter 非空），新添加的词不在 filtered 内，
  // 因此下方两个定位 effect 均无操作，待筛选清空后才生效（Task-5 验收的已知边界）
  // 定位选中词（P2「添加成功后定位新词」）：若所在分组折叠则先展开
  useEffect(() => {
    if (!selectedWordId) return
    const group = groups.find(g => g.words.some(w => w.id === selectedWordId))
    if (group && collapsedGroups.has(group.key)) {
      setCollapsedGroups(prev => {
        const next = new Set(prev)
        next.delete(group.key)
        return next
      })
    }
  }, [selectedWordId, groups])

  // 滚动到选中行：虚拟列表用 scrollToIndex，普通列表用 scrollIntoView
  useEffect(() => {
    if (!selectedWordId) return
    const idx = rows.findIndex(r => r.kind === 'item' && r.word.id === selectedWordId)
    if (idx < 0) return
    if (shouldVirtualize) {
      virtualizer.scrollToIndex(idx, { align: 'auto' })
    } else {
      parentRef.current?.querySelector(`[data-word-id="${CSS.escape(selectedWordId)}"]`)?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedWordId, rows, shouldVirtualize])

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }, [])

  /** 点/敲组头：折叠切换 + 退出当前视图（§4.4「点树里任一节点即退出视图」）。
   *  键盘路径必须走同一个入口——只挂 onClick 会让键盘用户折叠分组时视图不退出，
   *  鼠标与键盘两条路对同一动作给出不同结果。 */
  const activateGroup = useCallback((key: string) => {
    if (activeView !== 'all') setSmartView('all')
    toggleGroup(key)
  }, [activeView, toggleGroup])

  const renderHeader = (row: HeaderRow) => {
    const isUncat = row.type === 'uncategorized'           // 未分类：纯标签，不可折叠
    const isFolded = collapsedGroups.has(row.key)
    const isCategoryCollapsedSidebar = collapsed && row.type === 'category'
    // 未分类标签（§4.3 mockup .uncategorized-label）：无 chevron、无点击、无数量
    if (isUncat) {
      return (
        <div key={row.key} className="select-none" style={{
          padding: collapsed ? '8px 0 4px' : '8px 12px 4px',
          fontSize: collapsed ? '9px' : 'var(--text-xs)',
          color: 'var(--color-text-tertiary)',
          fontWeight: 'var(--weight-medium)',
          textAlign: collapsed ? 'center' : undefined,
        }}>
          {row.label}
        </div>
      )
    }
    return (
      <div
        key={row.key}
        onClick={() => activateGroup(row.key)}
        onContextMenu={row.type === 'category' ? (e) => {
          e.preventDefault()
          const c = categoryById.get(row.key.replace(/^cat:/, ''))
          if (c) setMenu({ x: e.clientX, y: e.clientY, kind: 'category', category: c })
        } : undefined}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activateGroup(row.key) }
        }}
        role="button"
        tabIndex={0}
        className="flex items-center cursor-pointer select-none"
        style={{
          gap: '6px',
          padding: collapsed ? (row.type === 'category' ? '8px 6px' : '8px 12px 4px') : '8px 12px 4px',
          transition: 'background-color var(--duration-fast) var(--ease-smooth)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        {!isCategoryCollapsedSidebar && (
          <span style={{
            display: 'flex', transition: 'transform var(--duration-fast) var(--ease-smooth)',
            transform: isFolded ? 'rotate(-90deg)' : undefined, color: 'var(--color-text-tertiary)', flexShrink: 0,
          }}>
            <Icon name="chevron" size={14} />
          </span>
        )}
        {row.color && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: row.color, flexShrink: 0 }} />}
        <span style={{
          fontSize: collapsed ? (row.type === 'category' ? 'var(--text-xs)' : 'var(--text-sm)') : 'var(--text-sm)',
          fontWeight: 'var(--weight-medium)', color: 'var(--color-text-primary)',
          flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {row.label}
        </span>
        <span className="stat-num" style={{ fontSize: 'var(--text-xs)' }}>{row.count}</span>
      </div>
    )
  }

  const renderRow = (row: Row) => {
    if (row.kind === 'header') return renderHeader(row)
    return (
      <WordListItem
        key={row.key}
        word={row.word}
        categories={row.categories}
        selected={row.word.id === selectedWordId}
        collapsed={collapsed}
        mode={mode}
        onClick={e => handleRowClick(row, e)}
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, kind: 'word', word: row.word }) }}
        selectionMode={selectMode}
        checked={selected.has(row.key)}
      />
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <SidebarToolbar
        collapsed={collapsed}
        filter={filter}
        onFilterChange={setFilter}
        onToggleMode={onToggleMode}
        onToggleCollapse={onToggleCollapse}
        selectMode={selectMode}
        onToggleSelectMode={() => setSelectMode(true)}
        selectedCount={selectedWordIds.length}
        onSelectAll={() => setSelected(selectAll(wordRowKeys))}
        // 清空只清勾选，**不动锚点**：锚点是「上次点在哪一行」这个光标位置，抹掉它会让
        // 「清空后 Shift 点回去」变成只选一行。表格里清选区也不移动活动单元格，同一个道理。
        onClearAll={() => setSelected(new Set())}
        onExitSelect={exitSelect}
      />
      <SmartViewList
        views={visibleSmartViews(smartViews)}
        active={activeView}
        counts={viewCounts}
        onSelect={setSmartView}
      />
      <div ref={parentRef} className="flex-1 overflow-y-auto" style={{ padding: '8px' }}>
        {searching ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>搜索中…</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            {emptyText}
          </div>
        ) : shouldVirtualize ? (
          <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
            {virtualizer.getVirtualItems().map(vr => (
              <div
                key={rows[vr.index].key}
                data-index={vr.index}
                ref={virtualizer.measureElement}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vr.start}px)` }}
              >
                {renderRow(rows[vr.index])}
              </div>
            ))}
          </div>
        ) : (
          rows.map(renderRow)
        )}
      </div>
      {/* 批量操作条（v0.6.5 §4.2）：排在该 flex 列的末尾、footer 之上，是**在流内**的一节
          （不是浮层）——它占掉自己的高度，剩下的给上面的滚动容器，因此不会遮挡 footer。
          三个动作，前两个共用分类下拉浮层。
          收起态（最窄 120px）下三个中文标签放不下，换成图标按钮 + tooltip + aria-label——
          这是本次唯一一处「按宽度换形态」。
          **一行不肯换行的算法**（v0.6.5 修订）：收起态三颗图标钮 24px + 两道 spacing 各 8px
          = 88px，恰好装进「侧栏 120 − 两侧 margin 16 − 容器 padding 16 = 88」。原来那版
          flexWrap: wrap + 每颗 28px 宽（内边距 0 8px）算下来是 92px，超 4px 就折行——
          折行后三颗挤在左上角，既不是一行也不对称。现在 nowrap + space-between：
          两端贴边、中间那颗因两侧留白相等而落在正中（三颗等宽时这是恒等式，不是巧合）。
          浮层传 placement="top"：本条贴侧栏底部，向下会撞上 footer。 */}
      {selectMode && selectedWordIds.length > 0 && (
        <div style={{ margin: '6px 8px 8px' }}>
          <div ref={batchAnchorRef} style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            flexWrap: 'nowrap', justifyContent: 'space-between',
            padding: '8px', background: 'var(--color-surface)',
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-raised)',
          }}>
            <BatchChip label="加入分类" icon="plus" collapsed={collapsed}
              onClick={() => setBatchPopover(batchPopover === 'add' ? null : 'add')} />
            <BatchChip label="从分类移除" icon="minus" collapsed={collapsed}
              onClick={() => setBatchPopover(batchPopover === 'remove' ? null : 'remove')} />
            <BatchChip label="删除" icon="trash" danger collapsed={collapsed} onClick={() => { void runBatchDelete() }} />
          </div>
          {batchPopover === 'add' && (
            <CategoryPickerPopover anchor={batchAnchorRef.current} align="left" placement="top" onClose={() => setBatchPopover(null)}
              onPick={categoryId => { void runBatchAssign(categoryId) }} />
          )}
          {batchPopover === 'remove' && (
            <CategoryPickerPopover anchor={batchAnchorRef.current} align="left" placement="top" onClose={() => setBatchPopover(null)}
              onPick={categoryId => { void runBatchUnassign(categoryId) }} />
          )}
        </div>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.kind === 'word' ? wordMenuItems(menu.word) : categoryMenuItems(menu.category)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}

/** 批量条上的一颗动作。收起态只留图标，标签进 title 与 aria-label。
 *  收起态内边距 6px（而非展开态的 10px）：三颗图标钮因此各 24px 宽，连同两道间距
 *  恰好是 88px，装进最窄侧栏（120px）那一行的净宽——这是「永不折行」成立的前提，
 *  改这个数前先看批量条那处的算式。 */
function BatchChip({ label, icon, danger, collapsed, onClick }: {
  label: string
  icon: IconName
  danger?: boolean
  collapsed: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        height: '28px', padding: collapsed ? '0 6px' : '0 10px',
        border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
        background: 'var(--color-surface-raised)', cursor: 'pointer',
        color: danger ? 'var(--color-danger)' : 'var(--color-text-primary)',
        fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)',
        whiteSpace: 'nowrap', flexShrink: 0,
      }}
    >
      <Icon name={icon} size={12} />
      {!collapsed && label}
    </button>
  )
}
