import { Fragment, useState, useMemo, useEffect, useImperativeHandle } from 'react'
import type { ReactNode } from 'react'
import type * as React from 'react'
import type { DictionaryField } from '../../types/dictionary'
import type { MergeFieldInput } from '../../services/wordService'
import { useSettingsStore } from '../../stores/settingsStore'
import { isFieldVisible } from '../../lib/fieldTree'
import type { DisplayFieldKey } from '../../stores/settingsStore'
import { flattenTree, buildMergeInputs, toggleSubtreeSelection, shouldNumberField, countZhEn, countAllDefinitions } from '../../lib/dictPlan'
import type { FlatNode } from '../../lib/dictPlan'
import CheckBox from '../ui/CheckBox'
import SenseFlow from '../entry/SenseFlow'
import type { SenseGroup } from '../entry/SenseFlow'
import FlowRow from '../entry/FlowRow'

interface Props {
  word: string
  /** 服务层已合流去重的字段树（lib/dictMerge），节点带 source。 */
  fields: DictionaryField[]
}

// 受控句柄：面板合并按钮经 ref 调用 buildInputs 取当前勾选构建的 merge 输入
export interface DictDetailCardHandle {
  buildInputs: () => MergeFieldInput[] | null
}

// 字段类型 → 展示标签（词性节点由 SenseFlow 的 run-in 头承担，故此处不映射）。
// v0.7.2 起释义不再拼「中文释义(1)」这类标签——义号移进 FlowRow 的左槽。
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

// 一行的标题：近义词辨析组的标题就是组描述（spec：注释小字改小标题），其余走字段标签。
function rowLabel(node: FlatNode): string {
  return node.field.key === 'synonym_discrimination_group' ? node.field.value : fieldLabel(node.field.key)
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
    // 顶层容器由 SenseFlow 的 run-in 头承担，没有勾选框，故不种进 selected：种进去就永远删不掉，
    // selected.size 再也到不了 0，「合并添加」的 disabled 判据随之失效、计数也带上一个下限。
    // buildMergeInputs 的 addLineage 会在其子项被选中时把祖先补回来，故默认全选的输出不变。
    const walk = (nodes: FlatNode[], topLevel: boolean) => {
      for (const n of nodes) {
        if (!(topLevel && n.children.length > 0)) all.add(n.key)
        walk(n.children, false)
      }
    }
    walk(flat, true)
    setSelected(all)
  }, [word_, flat])

  // 词性组默认全部展开（v0.4.4：默认展开，用户可「全部收起」），换词时重置为空
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())
  useEffect(() => {
    setCollapsedKeys(new Set())
  }, [word_])

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

  // 中英释义行尾的来源小标记（其余字段类型不带）。只做提示，不参与勾选与入库。
  const sourceMark = (node: FlatNode) => {
    const src = node.field.source
    if (!src || (node.field.key !== 'chinese_definition' && node.field.key !== 'english_definition')) return null
    return (
      <span
        title={src === 'wordnet' ? '来自 WordNet' : '来自 ECDICT'}
        style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 11.5, color: 'var(--color-text-tertiary)', flexShrink: 0 }}
      >
        {src === 'wordnet' ? '·wn' : '·ec'}
      </span>
    )
  }

  // 行尾槽（FlowRow 的 end）：来源标 + 勾选框。
  // 勾选框沿用卡片既有激活形态（v0.7.2 Ruling 36）：<button> 自己经 onChange 切换，外层 span
  // 只吞冒泡。FlowRow 本身没有行级 onClick（整行不再点击折叠），这层吞冒泡是防御性的——
  // 一旦将来给行加点击，勾选框不会被顺手带上。
  const endSlot = (node: FlatNode, checkboxLabel: string): ReactNode => {
    const isContainer = node.children.length > 0
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {sourceMark(node)}
        <span style={{ display: 'inline-flex' }} onClick={e => e.stopPropagation()}>
          <CheckBox
            checked={selected.has(node.key)}
            label={checkboxLabel}
            onChange={isContainer ? () => toggleSubtree(node.key) : () => toggle(node.key)}
          />
        </span>
      </span>
    )
  }

  // 一行的正文内容（spec §8.2）：中英释义、例句（衬线斜体 + 短破折号）、
  // 词形变化 / 近义词辨析项（「标签: 值」），容器行显示其标题。
  const renderContent = (node: FlatNode): ReactNode => {
    switch (node.field.key) {
      case 'chinese_definition':
        return node.field.value
      case 'english_definition':
        return (
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: '14.5px', lineHeight: 1.65, color: 'var(--color-text-secondary)' }}>
            {node.field.value}
          </span>
        )
      case 'example':
        return (
          <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '14px', lineHeight: 1.65, color: 'var(--color-text-secondary)' }}>
            <span style={{ color: 'var(--color-border-strong)', marginRight: '8px' }}>–</span>{node.field.value}
          </span>
        )
      case 'exchange_item':
      case 'synonym_discrimination_item': {
        const colonIdx = node.field.value.indexOf(':')
        if (colonIdx > 0) {
          return (
            <>
              <span style={{ color: 'var(--color-text-secondary)' }}>{node.field.value.substring(0, colonIdx)}:</span>{' '}
              <span style={{ fontFamily: 'var(--font-serif)' }}>{node.field.value.substring(colonIdx + 1).trim()}</span>
            </>
          )
        }
        return node.field.value
      }
      default:
        // 容器行（例句 / 近义词 / 词形变化…）：显示标题；叶子：显示值
        return node.children.length > 0 ? rowLabel(node) : node.field.value
    }
  }

  // 组内行：FlowRow 一行 + 其子级（文档序递归）。义号在中/英释义间**连续**（1..N），
  // 容器行不编号；折叠态由「全部收起/展开」驱动（SenseFlow 的 run-in 头没有单组折叠控件）。
  const renderRows = (nodes: FlatNode[], counter: { n: number }): ReactNode =>
    nodes.map(node => {
      const isContainer = node.children.length > 0
      const isDefinition = shouldNumberField(node.field.key)
      const no = isDefinition ? ++counter.n : undefined
      const label = rowLabel(node)
      const checkboxLabel = isDefinition && no !== undefined ? `${label}(${no})` : (label || node.field.value || node.field.key)
      const collapsed = isContainer && collapsedKeys.has(node.key)
      return (
        <Fragment key={node.key}>
          <FlowRow no={no} state="original" end={endSlot(node, checkboxLabel)}>
            {renderContent(node)}
          </FlowRow>
          {isContainer && !collapsed && renderRows(node.children, counter)}
        </Fragment>
      )
    })

  // 正文流分组（SenseFlow）：每个顶层容器（词性组 / 补充 / 词形变化…）一个 run-in 头。
  // 词性组右侧计数沿用 countZhEn（中 N · 英 M），其余容器显示子项数。
  const groups: SenseGroup[] = flat.map(node => {
    const isPos = node.field.key === 'part_of_speech'
    const z = countZhEn(node)
    const collapsed = node.children.length > 0 && collapsedKeys.has(node.key)
    return {
      pos: isPos ? node.field.value : (rowLabel(node) || node.field.value),
      counts: isPos ? `中 ${z.cn} · 英 ${z.en}` : (node.children.length > 0 ? String(node.children.length) : undefined),
      items: collapsed ? null : renderRows(node.children.length > 0 ? node.children : [node], { n: 0 }),
    }
  })

  const totalDefs = countAllDefinitions(fields)

  return (
    <>
      {/* 正文流上方一行细动作（spec §8.3）：条目计数 + 全部展开/收起，右对齐。
          那张大卡已去掉（v0.7.2），卡片头降为这一行。 */}
      {(totalDefs.cn + totalDefs.en > 0 || containerKeys.size > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', padding: '2px 0 6px' }}>
          {totalDefs.cn + totalDefs.en > 0 && (
            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', background: 'var(--color-surface-sunken)', padding: '1px 8px', borderRadius: 'var(--radius-full)' }}>
              共 <b style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-primary)' }}>{totalDefs.cn + totalDefs.en}</b> 条释义
            </span>
          )}
          {containerKeys.size > 0 && (
            <button
              type="button"
              className="text-xs font-medium"
              style={{ color: 'var(--color-text-secondary)', padding: '4px 8px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'transparent', border: '1px solid transparent', fontFamily: 'var(--font-sans)' }}
              onClick={toggleAll}
            >{allCollapsed ? '全部展开' : '全部收起'}</button>
          )}
        </div>
      )}

      <SenseFlow groups={groups} />
    </>
  )
}
