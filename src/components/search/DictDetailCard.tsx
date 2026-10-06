import { useState, useMemo, useEffect, useImperativeHandle, useRef } from 'react'
import type { ReactNode } from 'react'
import type * as React from 'react'
import type { DictionaryEntry, DictionaryField } from '../../types/dictionary'
import type { FieldSource } from '../../types/field'
import type { MergeFieldInput } from '../../services/wordService'
import { useWordStore } from '../../stores/wordStore'
import { useReviewOverlayStore } from '../../stores/reviewOverlayStore'
import { useCategoryStore } from '../../stores/categoryStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { isFieldVisible } from '../../lib/fieldTree'
import type { DisplayFieldKey } from '../../stores/settingsStore'
import { ensureWord, isWordInLibrary } from '../../lib/ensureWord'
import { setInitialFamiliarity } from '../../services/wordService'
import type { InitialFamiliarityChoice } from '../../services/wordService'
import { mergeEntryFields, flattenTree, buildMergeInputs, toggleSubtreeSelection, shouldNumberField, countZhEn, countAllDefinitions } from '../../lib/dictPlan'
import type { FlatNode } from '../../lib/dictPlan'
import PosTag from '../ui/PosTag'
import CheckBox from '../ui/CheckBox'
import SquareButton from '../ui/SquareButton'
import CategoryPickerPopover from '../ui/CategoryPickerPopover'
import Icon from '../icons'

interface Props {
  word: string
  source: string
  entries: DictionaryEntry[]
  /** 收录时用户选的初始熟悉度（1|2|3）。所有权在面板（spec §4.6），卡片只透传、不留副本：
   *  两份状态会漂，且面板的「已在库」一旦因本次点击翻过来，用户在这一页就再也设不了值。 */
  familiarity: InitialFamiliarityChoice
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

/**
 * 来源色（v0.6.3 条目 15）。
 *
 * 原先两种来源各带一个色相（ecdict 赭红 / wordnet 墨绿）。色相在这里只是装饰——
 * 卡片已经有来源标签的文字区分，再叠一层颜色等于让装饰与内容争注意力。
 * 统一到基础字色，让释义成为唯一被看的东西。
 *
 * 抽成函数而不是留一个常量表：调用点只有两处（左侧竖条、徽标底色），徽标上的文字色是
 * 硬编码的 `'white'`，本来就不经这里——「改接线」这类错误才有地方可测——
 * 与 SquareButton 的 buttonBackground 同一考虑。
 * （原先第三处「＋ 添加此词典」按钮文字在 v0.6.5 §4.6 拆成 SquareButton 后已不再取色，
 *  底色改由 SquareButton 的 tone 套决定，此处与它无关。）
 */
export function sourceAccent(_source: string): string {
  return 'var(--color-text-primary)'
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
  word: word_, source: source_, entries, familiarity,
  onSelectionChange, ref,
}: Props & {
  onSelectionChange?: (source: string, count: number) => void
  ref?: React.Ref<DictDetailCardHandle>
}) {
  const mergeWordFields = useWordStore(s => s.mergeWordFields)
  const displayFields = useSettingsStore(s => s.displayFields)
  const sourceLabel = SOURCE_NAMES[source_] || source_
  const accent = sourceAccent(source_)

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
  // 「＋」分类下拉的开关，以及那颗按钮所在的紧贴容器——浮层的锚点（v0.6.5 修订：
  // 浮层已是 fixed 落位，锚点由它现算，祖先的 overflow 不再参与）。
  const [pickerOpen, setPickerOpen] = useState(false)
  const plusAnchorRef = useRef<HTMLDivElement>(null)
  // categoryId 只有「＋」路径传：主按钮不传，走的就是与改前逐字相同的那条路。
  const handleAdd = async (categoryId?: string) => {
    const inputs = buildMergeInputs(visible, selected, source_ as FieldSource)
    if (inputs.length === 0) return
    // 守卫必须在 ensureWord **之前**求值：ensureWord 收录成功就把新词塞进 store，
    // 那时再问「在不在库」，刚收录的库外词也会翻成「已在库」，熟悉度被静默丢掉——
    // 而这条路径正是为了不丢它才加的。判据与面板合并路径共用 isWordInLibrary。
    const wordWasInLibrary = isWordInLibrary(word_)
    // ＋ 路径用 skipDefaultCategory：它的语义是「只加入我选的那个分类」，
    // 若照旧先落默认分类，新词会同时挂在两个分类下（本项要修的就是这个）。
    const word = await ensureWord(word_, categoryId ? { skipDefaultCategory: true } : undefined)
    if (!word) {
      setError(true)
      window.setTimeout(() => setError(false), 2500)
      return
    }
    const ok = await mergeWordFields(word.id, inputs)
    if (ok) {
      // 熟悉度随收录一并写入，只在用户被问过时（spec §4.6：单选与本写入同一个条件）：
      // 在库词的面板显示「已在库」、familiarity 恒为重置默认值 1，无条件写就会把用户当初
      // 选的档覆写成「完全陌生」。失败不阻断收录——字段已入库，缺失只让该词回落 1。
      if (!wordWasInLibrary) {
        const wrote = await setInitialFamiliarity(word.id, familiarity)
        // 同 handleMergeAdd：熟悉度刚写进库，chip 读的 overlay 还停在收录前，不重取就显示「陌生」。
        // 刷新跟写入放在一起，而不是挂进 wordStore——叠加层的刷新时机与词条内容不同。
        if (wrote) void useReviewOverlayStore.getState().loadOverlay()
      }
      // 「＋」路径：合并成功后再把这个词归入所选分类。主按钮不传 categoryId，走的就是
      // ensureWord → addWord 里 assignDefaultToWord 那条路（默认分类只写一次，见上）；
      // ＋ 路径则在 addWord 阶段就跳过了默认分类，这里补上用户真正选的那个。
      // 与面板 handleMergeAdd 同一形状、同一位置：mergeWordFields 失败那一支提前走了，
      // 不会给一个没合并成功的词落分类。词已在库时同样有效。
      if (categoryId) {
        await useCategoryStore.getState().assignMany([word.id], categoryId)
      }
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

  const totalDefs = countAllDefinitions(merged)

  return (
    <div className="rounded-lg border overflow-hidden"
      style={{
        borderColor: 'var(--color-border)',
        borderLeft: `3px solid ${accent}`,
        background: 'var(--color-surface)',
      }}>
      {/* 卡片头部：来源徽章 + 名称 + 条目计数 + 「全部展开/收起」 + 折叠 */}
      <div className="px-4 py-2.5 flex items-center gap-2">
        <span style={{
          width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 'var(--radius-sm)', background: accent, color: 'white',
          fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: 13, flexShrink: 0,
        }}>
          {sourceLabel[0]}
        </span>
        <span className="text-sm font-semibold" style={{ letterSpacing: '0.02em' }}>{sourceLabel}</span>
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

      {/* 底部：添加此词典（右下角），复用 handleAdd + added/error 反馈。
          v0.6.5 §4.6 起拆成主按钮 + 「＋」：主按钮行为与改前逐字相同（落默认分类），
          「＋」在同一套 handleAdd 成功后多归入所选分类，故两颗按钮的反馈不可能分叉。
          两颗同用一个 disabled 判据（added || selected.size === 0），成功期间一起禁用。
          tone="surface"：卡片底是纯白 --color-surface，按 SquareButton 的 tone 判据取白底套。
          这一行是 justify-end，所以两颗按钮整体贴卡片右内边缘；里面的定位容器不再需要
          撑宽度（v0.6.5 修订：下拉浮层已改为 fixed 落位，宽度与定位都不再由容器决定），
          多出来的 220px 空壳一并去掉——它正是「＋ 看着没右对齐」的成因。 */}
      <div className="px-4 py-2 flex items-center justify-end gap-1 flex-wrap"
        style={{ borderTop: '1px solid var(--color-border)' }}>
        <SquareButton size="nav" tone="surface" disabled={added || selected.size === 0} onClick={() => void handleAdd()}>
          {added ? '已添加 ✓' : '添加此词典'}
        </SquareButton>
        {/* 容器紧贴「＋」（inline-flex 由内容定宽），故它同时是浮层的锚点元素：
            面板左边缘从这里现算，横向对齐不再靠祖先的宽度。 */}
        <div ref={plusAnchorRef} style={{ display: 'inline-flex' }}>
          <SquareButton size="nav" tone="surface" aria-label="选择分类后添加此词典" disabled={added || selected.size === 0}
            onClick={() => setPickerOpen(o => !o)}>
            <Icon name="plus" size={12} />
          </SquareButton>
          {/* 不传 placement：默认 'bottom'（向下）对这张卡片底部是对的——卡片根节点的
              overflow: hidden 不再能吃掉落点，面板已是 fixed。 */}
          {pickerOpen && (
            <CategoryPickerPopover anchor={plusAnchorRef.current} onClose={() => setPickerOpen(false)}
              onPick={categoryId => { setPickerOpen(false); void handleAdd(categoryId) }} />
          )}
        </div>
      </div>
    </div>
  )
}
