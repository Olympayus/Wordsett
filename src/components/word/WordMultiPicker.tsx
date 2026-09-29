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
   * 打开时的重置以**这个 prop 的引用**为触发条件（见下面的 effect），所以调用方每次渲染
   * 都新建数组的话，勾选集会被反复重置（用户刚点掉的勾又被勾回来）。方向或分类真的
   * 变了才重置，正是这里要的行为。
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

  // 每次打开都重置：方向与分类变了就该重新来。「移除」预勾选全部现有成员，「加入」全不勾。
  useEffect(() => {
    if (!open) return
    setQuery('')
    setChecked(direction === 'remove' ? new Set(memberIds) : new Set())
  }, [open, direction, memberIds])

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
          <Button variant="secondary" onClick={() => setChecked(selectAll(shown.map(w => w.id)))}>全选</Button>
          <Button variant="secondary" onClick={() => setChecked(new Set())}>清空</Button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '4px' }}>
          {shown.length === 0 ? (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', padding: '16px', textAlign: 'center' }}>
              {direction === 'remove' ? '这个分类下还没有单词' : '没有匹配的单词'}
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
