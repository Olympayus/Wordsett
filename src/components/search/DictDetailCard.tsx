import { Fragment, useState, useMemo, useEffect, useImperativeHandle } from 'react'
import type { ReactNode } from 'react'
import type * as React from 'react'
import type { DictionaryField } from '../../types/dictionary'
import type { MergeFieldInput } from '../../services/wordService'
import { useSettingsStore } from '../../stores/settingsStore'
import { isFieldVisible } from '../../lib/fieldTree'
import type { DisplayFieldKey } from '../../stores/settingsStore'
import { flattenTree, buildMergeInputs, toggleSubtreeSelection, shouldNumberField, countZhEn } from '../../lib/dictPlan'
import type { FlatNode } from '../../lib/dictPlan'
import CheckBox from '../ui/CheckBox'
import SenseFlow from '../entry/SenseFlow'
import type { SenseGroup } from '../entry/SenseFlow'
import FlowRow from '../entry/FlowRow'
import LeafFlow from '../entry/LeafFlow'
import { leafForm, rowTitle } from '../../lib/fieldKind'
import { isLeafFlow } from '../../lib/leafFlow'
import Icon from '../icons'
import { ENTRY_BAND_WIDTH } from '../../lib/layout'

interface Props {
  word: string
  /** 服务层已合流去重的字段树（lib/dictMerge），节点带 source。 */
  fields: DictionaryField[]
}

// 受控句柄：面板合并按钮经 ref 调用 buildInputs 取当前勾选构建的 merge 输入
export interface DictDetailCardHandle {
  buildInputs: () => MergeFieldInput[] | null
  /**
   * 「全部收起 / 全部展开」的唯一实现（v0.7.2 修复 8）。该按钮已移进面板的页签条右端
   * （它属于页签条，不属于正文流），而折叠态住在卡片里（collapsedKeys / containerKeys 都由
   * 字段树推出），故面板经此句柄回调——**不留第二份折叠逻辑**，两处入口共用同一实现。
   */
  toggleAll: () => void
}

/** 折叠态上报（v0.7.2 修复 8）：面板据此决定页签条右端那枚按钮是否出现、以及它显示哪个文案。 */
export interface CollapseState {
  /** 有可折叠的容器（词性组 / 分组）——没有就不渲染那枚按钮。 */
  hasContainers: boolean
  /** 当前所有容器都处于折叠态（文案切「全部展开」）。 */
  allCollapsed: boolean
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
// 「这一行该印什么」问 lib/fieldKind 的 rowTitle——与工作区同一出处，两页不得各写一遍。
function rowLabel(node: FlatNode): string {
  return rowTitle(node.field.key, node.field.value, fieldLabel(node.field.key))
}

export default function DictDetailCard({
  word: word_, fields,
  onSelectionChange, onCollapseStateChange, ref,
}: Props & {
  onSelectionChange?: (count: number) => void
  /** 折叠态变化上报面板（页签条右端的「全部收起 / 全部展开」按钮）。 */
  onCollapseStateChange?: (state: CollapseState) => void
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

  // 单组折叠（v0.7.2 修复 7）：每个 run-in 头右端那枚折叠键的目标。与 toggleAll 共用
  // 同一个 collapsedKeys——两个入口不会各记一份状态，全部收起后逐组展开也不会打架。
  const toggleGroup = (key: string) => {
    setCollapsedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  // 受控句柄：面板合并按钮经 ref 取当前勾选构建的 merge 输入（无勾选返回 null）；
  // 页签条右端的「全部收起」经同一句柄调 toggleAll（见 DictDetailCardHandle 注释）。
  useImperativeHandle(ref, () => ({
    buildInputs: () => selected.size === 0 ? null : buildMergeInputs(visible, selected),
    toggleAll,
  }), [visible, selected, allCollapsed, containerKeys])

  // 勾选数变化上报面板（面板合并按钮 disabled 态）
  useEffect(() => {
    onSelectionChange?.(selected.size)
  }, [selected, onSelectionChange])

  // 折叠态上报面板（页签条右端按钮的显隐与文案）
  useEffect(() => {
    onCollapseStateChange?.({ hasContainers: containerKeys.size > 0, allCollapsed })
  }, [containerKeys, allCollapsed, onCollapseStateChange])

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
  // 叶子走哪套排版由 lib/fieldKind 的 leafForm 唯一判定（与工作区同一函数），
  // 不再各写一遍 key 判断；表内键回落 'plain'（普通正文）。
  const renderContent = (node: FlatNode): ReactNode => {
    const form = leafForm(node.field.key)
    switch (form) {
      case 'english-def':
        return (
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: '15px', lineHeight: 1.7, color: 'var(--ink-1)' }}>
            {node.field.value}
          </span>
        )
      case 'example':
        return (
          <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '14px', lineHeight: 1.65, color: 'var(--ink-2)' }}>
            <span style={{ color: 'var(--ink-3)', marginRight: '8px' }}>–</span>{node.field.value}
          </span>
        )
      case 'plain':
        // 词形变化 / 近义词辨析项（「标签: 值」）；容器行（例句 / 近义词 / 词形变化…）显示标题；
        // 其余叶子（含中文释义：leafForm 对它是 'plain'）显示值——与改判据前逐字一致。
        // 下面这条只问「值该套哪副渲染壳」（`标签: 值` 拆写），不问叶子形状——形状判据仍是上面的
        // leafForm；此处的裸 key 比较即守卫 allow-list 里点名豁免的那一条。
        if (node.field.key === 'exchange_item' || node.field.key === 'synonym_discrimination_item') {
          const colonIdx = node.field.value.indexOf(':')
          if (colonIdx > 0) {
            return (
              <>
                <span style={{ color: 'var(--color-text-secondary)' }}>{node.field.value.substring(0, colonIdx)}:</span>{' '}
                <span style={{ fontFamily: 'var(--font-serif)' }}>{node.field.value.substring(colonIdx + 1).trim()}</span>
              </>
            )
          }
        }
        return node.children.length > 0 ? rowLabel(node) : node.field.value
    }
  }

  // 组内行：FlowRow 一行 + 其子级（文档序递归）。义号在中/英释义间**连续**（1..N），
  // 容器行不编号；行内的子容器（例句 / 近义词辨析…）仍只随「全部收起/展开」整组折叠——
  // 单组折叠键（v0.7.2 修复 7）只挂在顶层分组的 run-in 头上，行尾槽留给来源标与勾选框。
  //
  // v0.7.2 二轮（缺陷 4）：子级块 `marginTop: -4px` —— 容器行 → 首个子级的间距收到设计稿的
  // 紧值。设计稿里**例子块是嵌在释义行里的**（`.sense .tx > .ex`，showcase-v2:196 的
  // `.ex{margin-top:4px}`），所以那一段只有 4px；本页则把子级渲染成容器行的**兄弟 FlowRow**，
  // 于是间距 = 容器行底内边距 4 + 子级行顶内边距 4 = **8px**，正好是设计值的两倍。
  // 用户原话「标题离下方的子标题间距过大……近义词与其中的词的间距」。
  // 扣掉的 4px 正是被兄弟模型重复计算的那一层（FlowRow 的 11px 左缩进量与上下 4px 都照旧）。
  // 只改**返回页**：工作区的同一处已在 ecd3b4f 收过一轮（额外 marginTop 8/4 → 0），用户此后
  // 未再抱怨，故此处不动它（见报告「分歧」）。
  //
  // 来源：本页**永远不出色条**（`state="none"`）——返回页没有编者模式，来源态（v0.7.3 的四态）
  // 是编者视角的信息，在这里只会给每一行平白画一条中性条。来源的提示因此只在行尾那枚
  // `·ec` / `·wn` 文字标上（`sourceMark`，见上），不走左缘色条。四态落地前这里给的是
  // `'original'`（当时 original 不出条，等效）；v0.7.3 original 改出中性条后必须显式给
  // `'none'`，否则返回页每一行都会冒出条来。
  const renderRows = (nodes: FlatNode[], counter: { n: number }): ReactNode =>
    nodes.map(node => {
      const isContainer = node.children.length > 0
      const isDefinition = shouldNumberField(node.field.key)
      const no = isDefinition ? ++counter.n : undefined
      const label = rowLabel(node)
      const checkboxLabel = isDefinition && no !== undefined ? `${label}(${no})` : (label || node.field.value || node.field.key)
      const collapsed = isContainer && collapsedKeys.has(node.key)
      // v0.7.3 §5.4：容器下的子项若全是短叶子（近义词 / 词源相关词 / 词形变化…），
      // 不再逐个递归成一行一条，改由 LeafFlow 排成流式多列。判据只看子项形状（不看 key）。
      // 每项包成 `{ content: renderContent(c) }`，保住 `标签: 值` 的拆写；**不传 `end`**——
      // 返回页没有编者模式，单位行尾槽在这里无处可挂，DOM 因此与本轮之前逐字相同。
      const leafFlow = isContainer && isLeafFlow(
        node.children.map(c => ({ value: c.field.value, childCount: c.children.length })),
        node.field.key,
      )
      return (
        <Fragment key={node.key}>
          {/* `no` 一律给值（无编号的行给 ''）：v0.7.2 二轮 FlowRow 改成「编号槽缺席即零宽」，
              这里必须显式补一个空串，才能保住设计稿的空编号槽（showcase-v2:831 的
              `<span class="no"></span>`）——返回页的例句 / 近义词行因此仍与带编号的释义行同一条
              左缘，不会因为这次改动往里缩 18px。工作区不同：它的行全部无编号，缺的正是这个槽。 */}
          <FlowRow no={no ?? ''} state="none" end={endSlot(node, checkboxLabel)}>
            {renderContent(node)}
          </FlowRow>
          {isContainer && !collapsed && (
            leafFlow
              // 与下面未分流的兄弟分支同用 `marginTop: -4px`：LeafFlow 自身带 `padding: 4px 0`，
              // 与容器行底的 4px 相加会翻倍成 8px，故同样要扣掉被兄弟模型重复计算的那一层——
              // 两条分支的容器→子项间距才一致（brief 验收项 4「返回页同一组字段行为一致」）。
              // 不改 LeafFlow 自身的内边距：它与工作区共用，那里的 4px 顶内边距是与 FlowRow 对齐所需。
              ? <div style={{ marginTop: '-4px' }}><LeafFlow items={node.children.map(c => ({ content: renderContent(c) }))} /></div>
              : <div style={{ marginTop: '-4px' }}>{renderRows(node.children, counter)}</div>
          )}
        </Fragment>
      )
    })

  // 单组折叠键（v0.7.2 修复 7「每个小标题对应的收起下拉按钮补上」）：与工作区 SenseGroup.head
  // 同一条路——SenseFlow 的标准 run-in 头没有单组折叠控件，故这里自绘头（head 槽位整块取代
  // pos/counts/横线那一行），只在右端多一枚该组自己的折叠键，字体与横线一律照抄标准头。
  const groupFold = (key: string, collapsed: boolean) => (
    <button
      type="button"
      title={collapsed ? '展开本组' : '收起本组'}
      aria-label={collapsed ? '展开本组' : '收起本组'}
      aria-expanded={!collapsed}
      onClick={() => toggleGroup(key)}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text-primary)' }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
      style={{
        alignSelf: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, padding: 0, flexShrink: 0,
        border: 'none', background: 'transparent', borderRadius: 'var(--radius-sm)',
        cursor: 'pointer', color: 'var(--color-text-tertiary)',
      }}
    >
      <Icon name={collapsed ? 'chevron-right' : 'chevron'} size={13} />
    </button>
  )

  // 正文流分组（SenseFlow）：每个顶层容器（词性组 / 补充 / 词形变化…）一个 run-in 头。
  // 词性组右侧计数沿用 countZhEn（中 N · 英 M），其余容器显示子项数。
  // v0.7.2 修复 7：头改由本页自绘（保住标准形：衬线斜体词性 + 11px 计数 + 拉到右缘的长横线），
  // 右端补上该组的折叠键；折叠仍走同一份 collapsedKeys，与「全部收起」不打架。
  const groups: SenseGroup[] = flat.map(node => {
    const isPos = node.field.key === 'part_of_speech'
    const z = countZhEn(node)
    const hasChildren = node.children.length > 0
    const collapsed = hasChildren && collapsedKeys.has(node.key)
    return {
      head: (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', paddingLeft: '11px' }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '16px', fontWeight: 600 }}>
            {isPos ? node.field.value : (rowLabel(node) || node.field.value)}
          </span>
          {isPos
            ? <span className="stat-num" style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{`中 ${z.cn} · 英 ${z.en}`}</span>
            : hasChildren && <span className="stat-num" style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{node.children.length}</span>}
          <span style={{ flex: 1, borderTop: '1px solid var(--color-border)', transform: 'translateY(-3px)' }} />
          {hasChildren && groupFold(node.key, collapsed)}
        </div>
      ),
      items: collapsed ? null : renderRows(hasChildren ? node.children : [node], { n: 0 }),
    }
  })

  return (
    // 正文度量改取 ENTRY_BAND_WIDTH（v0.7.2 修复 5）：正文与头带 / 页签条同宽，右缘齐平——
    // 用户要求「下方的内容和其他内容一并延长，整体都是同样的左右大小」。列的内容宽
    // = ENTRY_BAND_WIDTH − 2×ENTRY_COLUMN_PADDING_X（900 − 48 = 852）本就小于这个上限，
    // 故它实际等于列的内容宽（正文不再停在 ENTRY_MEASURE 660）。
    // 「共 N 条释义」与「全部收起」已移进面板的页签条（修复 4 / 8），正文流上方那一行细动作取消。
    <SenseFlow groups={groups} measure={ENTRY_BAND_WIDTH} />
  )
}
