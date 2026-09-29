import { useRef } from 'react'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useWordStore } from '../../stores/wordStore'
import { useCategoryStore } from '../../stores/categoryStore'
import { useViewStore } from '../../stores/viewStore'
import { useUiStore } from '../../stores/uiStore'
import SidebarToolbar from './SidebarToolbar'
import WordListItem from '../word/WordListItem'
import ContextMenu, { type MenuItem } from '../ui/ContextMenu'
import CategoryPickerPopover from '../ui/CategoryPickerPopover'
import { vocabularySearch } from '../../lib/search'
import { groupByLetter, groupByCategory, type SidebarMode } from '../../lib/sidebar'
import { rangeSelect, selectAll, pruneToRows } from '../../lib/selection'
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
  const { assignMany, unassignMany } = useCategoryStore()
  const { deleteWords } = useWordStore()
  const { categories, wordCategoryMap } = useCategoryStore()
  const [filter, setFilter] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [searching, setSearching] = useState(false)
  const [filtered, setFiltered] = useState<WordWithPreview[]>(words)

  // 筛选：空串显示全部；非空走词库搜索（lemma + 字段值，沿用现状）
  useEffect(() => {
    if (!filter.trim()) { setFiltered(words); return }
    setSearching(true)
    vocabularySearch(filter).then(r => setFiltered(r)).finally(() => setSearching(false))
  }, [filter, words])

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

  // 批量动作的入参。由 rows 反查而非由 selected 直接映射：键是 `分组键:词id`，
  // 同一个词属于两个分类时会在分类模式下占两行，两行的 key 不同。按 key 逐行去重后
  // 得到的才是「词」而不是「行」，否则 assignMany 会收到重复 id（DB 侧 INSERT OR IGNORE /
  // DELETE 都幂等，无副作用，但确认框里的数字会虚高一倍）。
  const selectedWordIds = useMemo(() => {
    const ids = new Set<string>()
    for (const r of rows) if (r.kind === 'item' && selected.has(r.key)) ids.add(r.word.id)
    return [...ids]
  }, [rows, selected])

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

  const runBatchAssign = async (categoryId: string) => {
    await assignMany(selectedWordIds, categoryId)
    exitSelect()
  }

  // 「从分类移除」只对确实属于该分类的选中项生效，其余静默跳过。
  // 传入的是「已剪枝后的可见选中词」∩「确实挂在这个分类下的词」：
  // 交集为空时直接短路，连 IPC 都不发（DB 侧 DELETE 本就按 category_id 过滤、天然幂等，
  // 这里先收窄是为了让「选了一堆不在这分类里的词」这个情形在语义上就是空动作）。
  const runBatchUnassign = async (categoryId: string) => {
    const ids = selectedWordIds.filter(id => (wordCategoryMap[id] ?? []).includes(categoryId))
    if (ids.length === 0) { exitSelect(); return }
    await unassignMany(ids, categoryId)
    exitSelect()
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
        onClick={() => toggleGroup(row.key)}
        onContextMenu={row.type === 'category' ? (e) => {
          e.preventDefault()
          const c = categoryById.get(row.key.replace(/^cat:/, ''))
          if (c) setMenu({ x: e.clientX, y: e.clientY, kind: 'category', category: c })
        } : undefined}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGroup(row.key) }
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
        selectedCount={selected.size}
        onSelectAll={() => setSelected(selectAll(wordRowKeys))}
        onExitSelect={exitSelect}
      />
      <div ref={parentRef} className="flex-1 overflow-y-auto" style={{ padding: '8px' }}>
        {searching ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>搜索中…</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-text-tertiary)' }}>
            {words.length === 0 ? '词库为空，使用顶部搜索框添加单词' : '没有匹配的单词'}
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
      {/* 批量操作条（v0.6.5 §4.2）：浮在 footer 之上。三个动作，前两个共用分类下拉浮层。
          收起态（120px）下三个中文标签放不下，换成图标按钮 + tooltip + aria-label——
          这是本次唯一一处「按宽度换形态」。
          浮层传 placement="top"：本条贴侧栏底部，向下会被 AppShell 的 <aside>（overflow: hidden）裁掉。 */}
      {selectMode && selected.size > 0 && (
        <div style={{ position: 'relative', margin: '6px 8px 8px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap',
            padding: '8px', background: 'var(--color-surface)',
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-raised)',
          }}>
            <BatchChip label="加入分类" icon="plus" collapsed={collapsed}
              onClick={() => setBatchPopover(batchPopover === 'add' ? null : 'add')} />
            <BatchChip label="从分类移除" icon="close" collapsed={collapsed}
              onClick={() => setBatchPopover(batchPopover === 'remove' ? null : 'remove')} />
            <BatchChip label="删除" icon="trash" danger collapsed={collapsed} onClick={() => { void runBatchDelete() }} />
          </div>
          {batchPopover === 'add' && (
            <CategoryPickerPopover align="left" placement="top" onClose={() => setBatchPopover(null)}
              onPick={categoryId => { void runBatchAssign(categoryId) }} />
          )}
          {batchPopover === 'remove' && (
            <CategoryPickerPopover align="left" placement="top" onClose={() => setBatchPopover(null)}
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

/** 批量条上的一颗动作。收起态只留图标，标签进 title 与 aria-label。 */
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
        height: '28px', padding: collapsed ? '0 8px' : '0 10px',
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
