import { useState, useMemo, useEffect, useImperativeHandle } from 'react'
import type { ReactNode } from 'react'
import type * as React from 'react'
import type { DictionaryEntry, DictionaryField } from '../../types/dictionary'
import type { FieldSource } from '../../types/field'
import type { MergeFieldInput } from '../../services/wordService'
import { useWordStore } from '../../stores/wordStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { isFieldVisible } from '../../lib/fieldTree'
import type { DisplayFieldKey } from '../../stores/settingsStore'
import { ensureWord } from '../../lib/ensureWord'
import { mergeEntryFields, flattenTree, buildMergeInputs, toggleSubtreeSelection, shouldNumberField } from '../../lib/dictPlan'
import type { FlatNode } from '../../lib/dictPlan'
import PosTag from '../ui/PosTag'

interface Props {
  word: string
  source: string
  entries: DictionaryEntry[]
}

// 受控句柄：面板合并按钮经 ref 调用 buildInputs 取当前勾选构建的 merge 输入
export interface DictDetailCardHandle {
  buildInputs: () => MergeFieldInput[] | null
}

// 来源名称映射
const SOURCE_NAMES: Record<string, string> = {
  ecdict: 'ECDICT',
  wordnet: 'WordNet',
}

// V2 词典身份色：单一主色，白底卡片以左边框 + 徽章底色承载身份
const SOURCE_ACCENTS: Record<string, { color: string }> = {
  ecdict: { color: '#c17b5c' },
  wordnet: { color: '#5b8a82' },
}

// 字段类型 → 展示标签（词性节点用胶囊，故此处不映射）
function fieldLabel(key: string): string {
  switch (key) {
    case 'chinese_definition': return '中文释义'
    case 'english_definition': return '英文释义'
    case 'synonyms': return '近义词'
    case 'example_sentence': return '例句'
    case 'exchange': return '词形变化'
    case 'derivatives': return '词源相关词'
    case 'supplementary': return '补充'
    default: return ''
  }
}

// 子树叶子计数（词性窗格胶囊数字）
function countItems(node: FlatNode): number {
  if (node.children.length === 0) return 1
  return node.children.reduce((sum, c) => sum + countItems(c), 0)
}

export default function DictDetailCard({
  word: word_, source: source_, entries,
  onSelectionChange, ref,
}: Props & {
  onSelectionChange?: (source: string, count: number) => void
  ref?: React.Ref<DictDetailCardHandle>
}) {
  const mergeWordFields = useWordStore(s => s.mergeWordFields)
  const displayFields = useSettingsStore(s => s.displayFields)
  const sourceLabel = SOURCE_NAMES[source_] || source_
  const accent = SOURCE_ACCENTS[source_] || { color: 'var(--color-text-secondary)' }

  // 合并同词性父（跨 entry 显示为一窗格）
  const merged = useMemo(() => mergeEntryFields(entries.flatMap(e => e.fields)), [entries])

  // displayFields 级联隐藏的字段不渲染、不进入勾选
  const visible = useMemo(() => {
    const keyAllowed = (key: string) => {
      const control: Record<string, DisplayFieldKey> = {
        part_of_speech: 'part_of_speech',
        chinese_definition: 'chinese_definition', english_definition: 'english_definition',
        example: 'example', example_sentence: 'example',
        synonyms: 'synonyms', synonym_item: 'synonyms',
        exchange: 'exchange',
        derivatives: 'derivatives', derivatives_item: 'derivatives',
      }
      const c = control[key]
      return c ? isFieldVisible(c, displayFields) : true
    }
    const filter = (nodes: DictionaryField[]): DictionaryField[] =>
      nodes
        .filter(n => n.key !== 'phonetic') // 音标独立条（WordTitleExtras）接管：卡内彻底隐藏、不进勾选
        .filter(n => keyAllowed(n.key))
        .map(n => ({ ...n, children: n.children ? filter(n.children) : n.children }))
        .filter(n => !(n.value === '' && !(n.children && n.children.length > 0))) // 隐藏子字段后变空的容器无意义，丢弃
    return filter(merged)
  }, [merged, displayFields])

  const flat = useMemo(() => flattenTree(visible), [visible])

  // 全树路径 key 表（toggleSubtree 判定子树是否全选）
  const allNodeKeys = useMemo(() => {
    const keys: string[] = []
    const walk = (nodes: FlatNode[]) => { for (const n of nodes) { keys.push(n.key); walk(n.children) } }
    walk(flat)
    return keys
  }, [flat])

  // 容器节点（词性/分组，有 children）key 集合：头部「全部展开/收起」的作用对象
  const containerKeys = useMemo(() => {
    const keys = new Set<string>()
    const walk = (nodes: FlatNode[]) => { for (const n of nodes) { if (n.children.length) { keys.add(n.key); walk(n.children) } } }
    walk(flat)
    return keys
  }, [flat])

  // 勾选状态：Set<key>，key 为路径（'0'、'0-1'、'0-1-0'）
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => {
    const all = new Set<string>()
    const walk = (nodes: FlatNode[]) => { for (const n of nodes) { all.add(n.key); walk(n.children) } }
    walk(flat)
    setSelected(all)
  }, [word_, source_, flat])

  // 卡片整体折叠；词性组默认全部展开（v0.4.4：默认展开，用户可「全部收起」），换词时重置为空
  const [collapsed, setCollapsed] = useState(false)
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())
  useEffect(() => {
    setCollapsedKeys(new Set())
  }, [word_, source_])

  const toggleCollapse = (key: string) =>
    setCollapsedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })

  // 全部展开/收起：当前全部折叠 → 展开（清空 collapsedKeys）；否则收起（加入所有容器 key）
  const allCollapsed = containerKeys.size > 0 && [...containerKeys].every(k => collapsedKeys.has(k))
  const toggleAll = () => {
    if (allCollapsed) setCollapsedKeys(new Set())
    else setCollapsedKeys(new Set(containerKeys))
  }

  // 受控句柄：面板合并按钮经 ref 取当前勾选构建的 merge 输入（无勾选返回 null）
  useImperativeHandle(ref, () => ({
    buildInputs: () => selected.size === 0 ? null : buildMergeInputs(visible, selected, source_ as FieldSource),
  }), [visible, selected, source_])

  // 勾选数变化上报面板（面板合并按钮 disabled 态）
  useEffect(() => {
    onSelectionChange?.(source_, selected.size)
  }, [selected, source_, onSelectionChange])

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // 词性/容器级整体勾选：未全选 → 补全子树；全选 → 清空子树（dictPlan.toggleSubtreeSelection）
  const toggleSubtree = (key: string) => {
    setSelected(prev => toggleSubtreeSelection(prev, allNodeKeys, key))
  }

  // 免跳转添加：合并成功后卡片内「已添加 ✓」反馈（1.5s）；失败则短暂错误提示（2.5s，规格：失败不跳转）
  const [added, setAdded] = useState(false)
  const [error, setError] = useState(false)
  const handleAdd = async () => {
    const inputs = buildMergeInputs(visible, selected, source_ as FieldSource)
    if (inputs.length === 0) return
    const word = await ensureWord(word_)
    if (!word) {
      setError(true)
      window.setTimeout(() => setError(false), 2500)
      return
    }
    const ok = await mergeWordFields(word.id, inputs)
    if (ok) {
      setError(false)
      setAdded(true)
      window.setTimeout(() => setAdded(false), 1500)
    } else {
      setError(true)
      window.setTimeout(() => setError(false), 2500)
    }
  }

  // 叶子值渲染（例句/词形变化项等特殊排版）
  const renderValue = (node: FlatNode): ReactNode => {
    const key = node.field.key
    switch (key) {
      case 'example':
        return <div style={{ color: 'var(--color-text-secondary)', fontSize: '13px', fontStyle: 'italic' }}>"{node.field.value}"</div>
      case 'exchange_item': {
        const colonIdx = node.field.value.indexOf(':')
        if (colonIdx > 0) {
          return (
            <div style={{ fontSize: '13px' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>{node.field.value.substring(0, colonIdx)}:</span>{' '}
              <span style={{ fontFamily: 'var(--font-serif)' }}>{node.field.value.substring(colonIdx + 1).trim()}</span>
            </div>
          )
        }
        return <div style={{ fontSize: '13px' }}>{node.field.value}</div>
      }
      default:
        return <div>{node.field.value}</div>
    }
  }

  // 叶子/带值容器的「标题 + 值同行」内容（其余纯容器标题独占一行）
  const inlineContent = (node: FlatNode, label: string) => (
    <div className="flex items-baseline gap-1.5 flex-wrap" style={{ flex: 1, minWidth: 0 }}>
      {label && <span style={{ color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 700, letterSpacing: '0.5px' }}>{label}</span>}
      {(!node.children.length || shouldNumberField(node.field.key)) && renderValue(node)}
    </div>
  )

  // 递归渲染 flat 树：容器/词性行整棵勾选、行点击或 chevron 折叠；叶子与带值容器「标题+值」同行；
  // 子级 16px 缩进、无分割线；词性组默认展开（collapsedKeys）。
  const renderFlat = (nodes: FlatNode[]): ReactNode => {
    const seen = new Map<string, number>()
    const seenIndex = (key: string) => {
      const idx = seen.get(key) ?? 0
      seen.set(key, idx + 1)
      return idx
    }

    return nodes.map(node => {
      const isContainer = node.children.length > 0
      const isPos = node.field.key === 'part_of_speech'
      const isDefinition = shouldNumberField(node.field.key)
      const collapsed = isContainer && collapsedKeys.has(node.key)
      const label = fieldLabel(node.field.key) + (isDefinition ? `(${seenIndex(node.field.key) + 1})` : '')
      // 复选框可访问名：词性用「词性 <tag>」，其余优先字段标签、其次字段值、最后字段 key
      const checkboxLabel = isPos ? `词性 ${node.field.value}` : (label || node.field.value || node.field.key)

      return (
        <div key={node.key}>
          <div
            className="flex items-start gap-2 cursor-pointer rounded px-1"
            onClick={() => (isContainer ? toggleCollapse(node.key) : toggle(node.key))}
            style={{ padding: '6px 4px' }}
          >
            <input
              type="checkbox"
              aria-label={checkboxLabel}
              checked={selected.has(node.key)}
              onClick={e => e.stopPropagation()}
              onChange={isContainer ? () => toggleSubtree(node.key) : () => toggle(node.key)}
              style={{ marginTop: 3 }}
            />
            {isPos
              ? <div className="flex items-center gap-1.5"><PosTag value={node.field.value} /><span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{countItems(node)} 项</span></div>
              : inlineContent(node, label)}
            {isContainer && (
              <button
                type="button"
                aria-label={collapsed ? '展开分组' : '折叠分组'}
                onClick={e => { e.stopPropagation(); toggleCollapse(node.key) }}
                className="ml-auto"
                style={{ border: 'none', background: 'transparent', padding: '0 2px', cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: 11, fontFamily: 'var(--font-sans)' }}
              >{collapsed ? '▸' : '▾'}</button>
            )}
          </div>
          {isContainer && !collapsed && (
            <div style={{ paddingLeft: 16 }}>{renderFlat(node.children)}</div>
          )}
        </div>
      )
    })
  }

  return (
    <div className="rounded-lg border overflow-hidden"
      style={{
        borderColor: 'var(--color-border)',
        borderLeft: `3px solid ${accent.color}`,
        background: 'var(--color-surface)',
      }}>
      {/* 卡片头部：来源徽章 + 名称 + 条目计数 + 「全部展开/收起」 + 折叠 */}
      <div className="px-4 py-2.5 flex items-center gap-2">
        <span style={{
          width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 'var(--radius-sm)', background: accent.color, color: 'white',
          fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 13, flexShrink: 0,
        }}>
          {sourceLabel[0]}
        </span>
        <span className="text-sm font-semibold" style={{ letterSpacing: '0.02em' }}>{sourceLabel}</span>
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', background: 'var(--color-surface-sunken)', padding: '1px 8px', borderRadius: 'var(--radius-full)' }}>
          {flat.length} 条
        </span>
        {containerKeys.size > 0 && (
          <button
            type="button"
            className="ml-auto text-xs font-medium"
            style={{ color: 'var(--color-text-secondary)', padding: '4px 8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'transparent', border: '1px solid transparent', fontFamily: 'var(--font-sans)' }}
            onClick={toggleAll}
          >{allCollapsed ? '全部展开' : '全部收起'}</button>
        )}
        <button
          aria-label={collapsed ? '展开' : '折叠'}
          className={containerKeys.size === 0 ? 'ml-auto' : undefined}
          onClick={() => setCollapsed(c => !c)}
          style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-tertiary)' }}
        >
          <span style={{ display: 'inline-block', transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 200ms' }}>▾</span>
        </button>
      </div>

      {error && (
        <div className="px-4 pb-2" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>添加失败，请重试</div>
      )}

      {/* 卡片内容 - POS 分组树（整卡折叠时隐藏） */}
      {!collapsed && (
        <div className="px-4 py-3 space-y-3 text-sm">
          {renderFlat(flat)}
        </div>
      )}

      {/* 底部：添加此词典（右下角），复用 handleAdd + added/error 反馈 */}
      <div className="px-4 py-2 flex items-center justify-end" style={{ borderTop: '1px solid var(--color-border)' }}>
        <button
          type="button"
          className="text-xs font-medium"
          style={{ color: accent.color, padding: '4px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'transparent', border: '1px solid transparent', fontFamily: 'var(--font-sans)' }}
          onClick={handleAdd}
          disabled={added || selected.size === 0}
        >{added ? '已添加 ✓' : '＋ 添加此词典'}</button>
      </div>
    </div>
  )
}
