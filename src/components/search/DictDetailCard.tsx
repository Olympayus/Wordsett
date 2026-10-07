import { useState, useMemo, useEffect, useImperativeHandle } from 'react'
import type { ReactNode } from 'react'
import type * as React from 'react'
import type { DictionaryField } from '../../types/dictionary'
import type { MergeFieldInput } from '../../services/wordService'
import { useSettingsStore } from '../../stores/settingsStore'
import { isFieldVisible } from '../../lib/fieldTree'
import type { DisplayFieldKey } from '../../stores/settingsStore'
import { flattenTree, buildMergeInputs, toggleSubtreeSelection, shouldNumberField, countZhEn, countAllDefinitions } from '../../lib/dictPlan'
import type { FlatNode } from '../../lib/dictPlan'
import PosTag from '../ui/PosTag'
import CheckBox from '../ui/CheckBox'

interface Props {
  word: string
  /** 服务层已合流去重的字段树（lib/dictMerge），节点带 source。 */
  fields: DictionaryField[]
}

// 受控句柄：面板合并按钮经 ref 调用 buildInputs 取当前勾选构建的 merge 输入
export interface DictDetailCardHandle {
  buildInputs: () => MergeFieldInput[] | null
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
    case 'synonym_discrimination': return '近义词辨析'
    default: return ''
  }
}

export default function DictDetailCard({
  word: word_, fields,
  onSelectionChange, ref,
}: Props & {
  onSelectionChange?: (count: number) => void
  ref?: React.Ref<DictDetailCardHandle>
}) {
  const displayFields = useSettingsStore(s => s.displayFields)

  // displayFields 级联隐藏的字段不渲染、不进入勾选（合流已在服务层做完）
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
    return filter(fields)
  }, [fields, displayFields])

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
  }, [word_, flat])

  // 词性组默认全部展开（v0.4.4：默认展开，用户可「全部收起」），换词时重置为空
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())
  useEffect(() => {
    setCollapsedKeys(new Set())
  }, [word_])

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
    buildInputs: () => selected.size === 0 ? null : buildMergeInputs(visible, selected),
  }), [visible, selected])

  // 勾选数变化上报面板（面板合并按钮 disabled 态）
  useEffect(() => {
    onSelectionChange?.(selected.size)
  }, [selected, onSelectionChange])

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
      case 'synonym_discrimination_item': {
        const colonIdx = node.field.value.indexOf(':')
        if (colonIdx > 0) {
          return (
            <div style={{ fontSize: '13px' }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>{node.field.value.substring(0, colonIdx)}:</span>{' '}
              <span>{node.field.value.substring(colonIdx + 1).trim()}</span>
            </div>
          )
        }
        return <div style={{ fontSize: '13px' }}>{node.field.value}</div>
      }
      default:
        return <div>{node.field.value}</div>
    }
  }

  // 中英释义行尾的来源小标记（其余字段类型不带）。只做提示，不参与勾选与入库。
  const sourceMark = (node: FlatNode) => {
    const src = node.field.source
    if (!src || (node.field.key !== 'chinese_definition' && node.field.key !== 'english_definition')) return null
    return (
      <span
        title={src === 'wordnet' ? '来自 WordNet' : '来自 ECDICT'}
        style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-tertiary)', flexShrink: 0 }}
      >
        {src === 'wordnet' ? '·wn' : '·ec'}
      </span>
    )
  }

  // 叶子/带值容器的「标题 + 值同行」内容（其余纯容器标题独占一行）
  const inlineContent = (node: FlatNode, label: string) => (
    <div className="flex items-baseline gap-1.5 flex-wrap" style={{ flex: 1, minWidth: 0 }}>
      {label && <span style={{ color: 'var(--color-text-secondary)', fontSize: 12, fontWeight: 700, letterSpacing: '0.5px' }}>{label}</span>}
      {(!node.children.length || shouldNumberField(node.field.key)) && renderValue(node)}
      {sourceMark(node)}
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
      const z = countZhEn(node)
      const collapsed = isContainer && collapsedKeys.has(node.key)
      // 近义词辨析组的"小标题"=组描述（spec：注释小字改小标题，组为父级、成员为叶子）
      const label = node.field.key === 'synonym_discrimination_group'
        ? node.field.value
        : (fieldLabel(node.field.key) + (isDefinition ? `(${seenIndex(node.field.key) + 1})` : ''))
      // 复选框可访问名：词性用「词性 <tag>」，其余优先字段标签、其次字段值、最后字段 key
      const checkboxLabel = isPos ? `词性 ${node.field.value}` : (label || node.field.value || node.field.key)

      return (
        <div key={node.key}>
          <div
            className="flex items-start gap-2 cursor-pointer rounded px-1"
            onClick={() => (isContainer ? toggleCollapse(node.key) : toggle(node.key))}
            style={{ padding: '6px 4px' }}
          >
            {/* marginTop 是按**盒子高度**手调的光学对齐偏移：盒子的顶边与首行文字的 x-height
                对齐，盒子矮 4px 后沿用 3 会显得偏下。改这个值前先改 CheckBox 的尺寸常量。 */}
            <span
              style={{ marginTop: 2, display: 'inline-flex', flexShrink: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <CheckBox
                checked={selected.has(node.key)}
                label={checkboxLabel}
                onChange={isContainer ? () => toggleSubtree(node.key) : () => toggle(node.key)}
              />
            </span>
            {isPos
              ? <div className="flex items-center gap-1.5">
                  <PosTag value={node.field.value} />
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                    中 <b style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{z.cn}</b> · 英 <b style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{z.en}</b>
                  </span>
                </div>
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
            <div style={{ paddingLeft: 16 }}>
              {renderFlat(node.children)}
            </div>
          )}
        </div>
      )
    })
  }

  const totalDefs = countAllDefinitions(fields)

  return (
    <div className="rounded-lg border overflow-hidden"
      style={{
        borderColor: 'var(--color-border)',
        background: 'var(--color-surface)',
      }}>
      {/* 卡片头部：条目计数 + 「全部展开/收起」（右对齐） */}
      <div className="px-4 py-2.5 flex items-center gap-2">
        {totalDefs.cn + totalDefs.en > 0 && (
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', background: 'var(--color-surface-sunken)', padding: '1px 8px', borderRadius: 'var(--radius-full)' }}>
            共 <b style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{totalDefs.cn + totalDefs.en}</b> 条释义
          </span>
        )}
        {containerKeys.size > 0 && (
          <button
            type="button"
            className="ml-auto text-xs font-medium"
            style={{ color: 'var(--color-text-secondary)', padding: '4px 8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'transparent', border: '1px solid transparent', fontFamily: 'var(--font-sans)' }}
            onClick={toggleAll}
          >{allCollapsed ? '全部展开' : '全部收起'}</button>
        )}
      </div>

      {/* 卡片内容 - POS 分组树 */}
      <div className="px-4 py-3 space-y-3 text-sm">
        {renderFlat(flat)}
      </div>
    </div>
  )
}
