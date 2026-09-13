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
import { vocabularySearch } from '../../lib/search'
import { groupByLetter, groupByCategory, type SidebarMode } from '../../lib/sidebar'
import type { WordWithPreview } from '../../types/word'
import type { Category } from '../../types/category'
import Icon from '../icons'

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
        {!collapsed && <span className="stat-num" style={{ fontSize: 'var(--text-xs)' }}>{row.count}</span>}
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
        onClick={() => { void selectWord(row.word.id); showWorkbench() }}
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, kind: 'word', word: row.word }) }}
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
