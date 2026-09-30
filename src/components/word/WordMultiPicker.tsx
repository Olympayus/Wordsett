import { useEffect, useMemo, useRef, useState } from 'react'
import type { WordWithPreview } from '../../types/word'
import { useWordStore } from '../../stores/wordStore'
import { useCategoryStore } from '../../stores/categoryStore'
import { useFocusTrap } from '../../lib/useFocusTrap'
import { selectAll } from '../../lib/selection'
import CheckBox from '../ui/CheckBox'
import { Button } from '../ui/Button'

export type PickerDirection = 'add' | 'remove'

/**
 * 待选集（v0.6.5 §4.3）。**方向固定**、不做「勾选态即归属、确定时算差集」的一体式设计：
 * 差集模式在搜索过滤下是隐式全量写——用户搜出 3 个词、动了 1 个，其余 200 个的归属
 * 取决于它们是否恰好被加载进来。对「个人自用、无撤销」的场景太危险。
 *
 * 两个方向都是「按成员集取一边」：移除列成员，**加入列非成员**（v0.6.5 修订）。
 * 加入方向滤掉已在成员里的词，是因为把它们列出来没有任何可表达的意图——勾上再确认
 * 等于给一个已经在这个分类里的词再写一次同一条归属，用户既看不出差别（行尾的分类数
 * 不变），也得不到反馈。候选集与「这次操作会改变什么」对齐之后，列表里的每一行
 * 都是真的待办，确认键的「加入 N 个单词」里的 N 也才是一个真实的数量。
 *
 * 行尾那个「该词现有分类数」（§4.3）是**纯展示的补充读数**，刻意不并进这里：
 * pickerWords 的入参与返回值只认词表与成员集，它的用例锁的正是这套候选口径。
 * 分类数另从 wordCategoryMap 取（见组件内 categoryCountOf），两者互不影响。
 */
export function pickerWords(
  all: WordWithPreview[],
  memberIds: Set<string>,
  direction: PickerDirection,
  query: string,
): WordWithPreview[] {
  // 「移除」要成员、「加入」要非成员：同一谓词取反，避免两条各写一遍过滤条件后漂移
  const wantMember = direction === 'remove'
  const scoped = all.filter(w => memberIds.has(w.id) === wantMember)
  const q = query.trim().toLowerCase()
  if (q === '') return scoped
  return scoped.filter(w => w.lemma.toLowerCase().includes(q))
}

export function pickerConfirmLabel(direction: PickerDirection, count: number): string {
  return direction === 'add' ? `加入 ${count} 个单词` : `移除 ${count} 个单词`
}

export default function WordMultiPicker({ open, categoryName, memberIds, direction, onConfirm, onClose }: {
  open: boolean
  categoryName: string
  /**
   * 该分类当前的成员词 id——「移除」方向的候选范围与预勾选都由它决定。
   *
   * 下面的重置 effect 以**这个 prop 的引用**为触发条件，所以调用方必须把它 memo 住
   * （见 `CategorySettings.tsx` 的 `pickerMemberIds`）：每次渲染新建数组的话，用户刚点掉的
   * 勾会被重新勾回来。引用只在成员真的变了时才该变——那正是重置要发生的时刻。
   */
  memberIds: string[]
  direction: PickerDirection
  onConfirm: (wordIds: string[]) => void
  onClose: () => void
}) {
  const words = useWordStore(s => s.words)
  const wordCategoryMap = useCategoryStore(s => s.wordCategoryMap)
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(open, panelRef)

  const [query, setQuery] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const members = useMemo(() => new Set(memberIds), [memberIds])

  // 预勾选的来源：**实际会被渲染出来的候选**，不是 memberIds 本身。
  //
  // memberIds 来自 wordCategoryMap，行渲染来自 wordStore.words，两者各走各的加载路径，
  // 谁都不保证 memberIds ⊆ words（getPreviews 在 DB 出错时返回 []，而 words 初始为空、
  // 由异步的 loadWords 填充）。若直接拿 memberIds 播种，两边一旦对不上，checked 里就会
  // 装着一批**屏幕上没有行**的 id：列表空、确认键却亮着「移除 N 个单词」，而 N 是整个
  // 成员数——一次用户看不见、也无法审阅的批量 unassignMany。种子取自 rendered 候选之后，
  // checked ⊆ removeCandidates ⊆ words 成为结构性事实，不再靠断言维持。
  const removeCandidates = useMemo(
    () => pickerWords(words, members, 'remove', ''),
    [words, members])

  // 每次打开都重置：方向与分类变了就该重新来。「移除」预勾选全部候选，「加入」全不勾。
  // query 不在依赖里：打字**不得**重新播种，否则筛选一下就把筛选外的勾清掉。
  // words 在依赖里是有意的——弹层开着时 loadWords 落地（原先的空 words → 真实词表）
  // 正是该重播种的时刻，且 removeCandidates 只随 words/members 变，无关重渲染不会触发。
  useEffect(() => {
    if (!open) return
    setQuery('')
    setChecked(direction === 'remove' ? new Set(removeCandidates.map(w => w.id)) : new Set())
  }, [open, direction, removeCandidates])

  const shown = useMemo(
    () => pickerWords(words, members, direction, query),
    [words, members, direction, query])

  // 行尾的分类数：wordCategoryMap 本就是「词 → 它所属的分类 id 列表」，长度即答案，
  // 不另开查询。与上面的候选集**刻意解耦**——读的是 store，不是 pickerWords 的口径。
  const categoryCountOf = (wordId: string) => (wordCategoryMap[wordId]?.length ?? 0)

  // 空态说「这里为什么是空的」，按成因分三句，不能只按方向分：
  //  - 搜索无结果 → 没匹配上（两个方向同一句）
  //  - 加入方向、没搜索却空 → 词库里的词都已经是这个分类的成员（词库本身为空时另说）
  //  - 移除方向、没搜索却空 → 这个分类本来就没有词
  // 「加入」那一支是本次候选集收窄后新出现的态：收窄前它永远列全库，压根空不了。
  const emptyText = query.trim() !== ''
    ? '没有匹配的单词'
    : direction === 'add'
      ? (words.length === 0 ? '词库为空，使用顶部搜索框添加单词' : '所有单词都已在这个分类里')
      : (members.size > 0 ? '没有匹配的单词' : '这个分类下还没有单词')

  if (!open) return null

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'var(--color-scrim)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ width: '440px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '20px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-overlay)' }}>
        {/* 方向写进标题：用户在确认时不会把它搞反 */}
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', marginBottom: '14px' }}>
          {direction === 'add' ? `把单词加入「${categoryName}」` : `把单词移出「${categoryName}」`}
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <input
            type="text"
            placeholder="搜索单词…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ flex: 1, minWidth: 0, height: '32px', padding: '0 10px', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', outline: 'none' }}
          />
          {/* 全选是**替换**（selectAll 的契约），只覆盖当前列出来的行：搜索态下点它会把
              筛选外的成员移出勾选集。方向是「少移」而非「多移」，确认键的数字永远是真的，
              但这个作用域得让用户看得见。 */}
          <Button variant="secondary" title="全选当前列出的单词（会取消筛选外的选择）" onClick={() => setChecked(selectAll(shown.map(w => w.id)))}>全选</Button>
          <Button variant="secondary" onClick={() => setChecked(new Set())}>清空</Button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '4px' }}>
          {shown.length === 0 ? (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', padding: '16px', textAlign: 'center' }}>
              {emptyText}
            </div>
          ) : shown.map(w => (
            <label key={w.id} style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '6px 8px', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
              <CheckBox
                checked={checked.has(w.id)}
                label={w.lemma}
                onChange={() => setChecked(prev => {
                  const next = new Set(prev)
                  if (next.has(w.id)) next.delete(w.id); else next.add(w.id)
                  return next
                })}
              />
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>{w.lemma}</span>
              {/* 该词现有分类数（§4.3）：行内补充读数，够不着「统计数字」的量级，
                  故走三级灰 + xs 字号，不套 .stat-num（那套等宽+主色+半粗是给统计量的）。
                  「加入」方向下它是这个词有多重归属，「移除」方向下它说明移出去会剩下几个。 */}
              <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                {categoryCountOf(w.id)}
              </span>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button disabled={checked.size === 0} onClick={() => onConfirm([...checked])}>
            {pickerConfirmLabel(direction, checked.size)}
          </Button>
        </div>
      </div>
    </div>
  )
}
