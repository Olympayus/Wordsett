import { useEffect, useMemo, useRef, useState } from 'react'
import type { WordWithPreview } from '../../types/word'
import { useWordStore } from '../../stores/wordStore'
import { useFocusTrap } from '../../lib/useFocusTrap'
import { selectAll } from '../../lib/selection'
import CheckBox from '../ui/CheckBox'
import { Button } from '../ui/Button'

export type PickerDirection = 'add' | 'remove'

/**
 * 待选集（v0.6.5 §4.3）。**方向固定**、不做「勾选态即归属、确定时算差集」的一体式设计：
 * 差集模式在搜索过滤下是隐式全量写——用户搜出 3 个词、动了 1 个，其余 200 个的归属
 * 取决于它们是否恰好被加载进来。对「个人自用、无撤销」的场景太危险。
 */
export function pickerWords(
  all: WordWithPreview[],
  memberIds: Set<string>,
  direction: PickerDirection,
  query: string,
): WordWithPreview[] {
  const scoped = direction === 'remove' ? all.filter(w => memberIds.has(w.id)) : all
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
            /* 空态按**分类本来有没有词**分，不按方向分：「移除」入口搜不到东西时
               说的是「没匹配上」，不是「这个分类是空的」——后者是对用户数据的错误陈述。 */
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', padding: '16px', textAlign: 'center' }}>
              {members.size > 0 ? '没有匹配的单词' : '这个分类下还没有单词'}
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
