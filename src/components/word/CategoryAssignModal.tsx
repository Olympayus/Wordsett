import { useEffect, useRef } from 'react'
import { useFocusTrap } from '../../lib/useFocusTrap'
import { useCategoryStore } from '../../stores/categoryStore'
import Icon from '../icons'
import { Button } from '../ui/Button'
import CheckBox from '../ui/CheckBox'

interface Props {
  open: boolean
  wordId: string
  onClose: () => void
  onCreateNew: () => void
}

export default function CategoryAssignModal({ open, wordId, onClose, onCreateNew }: Props) {
  const { categories, wordCategoryIds, assignToWord, removeFromWord } = useCategoryStore()

  // Esc 关闭（§11 a11y 键盘可达）
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(open, panelRef)

  if (!open) return null

  const assigned = new Set(wordCategoryIds)

  const toggle = async (categoryId: string) => {
    if (assigned.has(categoryId)) {
      await removeFromWord(wordId, categoryId)
    } else {
      await assignToWord(wordId, categoryId)
    }
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'var(--color-scrim)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ width: '360px', padding: '24px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-overlay)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)' }}>选择分类</div>
          <button
            type="button" aria-label="关闭" title="关闭" onClick={onClose}
            style={{ width: '28px', height: '28px', border: 'none', background: 'transparent', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div style={{ maxHeight: '280px', overflowY: 'auto', marginBottom: '16px' }}>
          {categories.length === 0 ? (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', padding: '8px 0' }}>
              还没有分类，点击下方「新建分类」创建
            </div>
          ) : (
            categories.map(cat => (
              <label
                key={cat.id}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 4px', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}
              >
                <CheckBox checked={assigned.has(cat.id)} onChange={() => toggle(cat.id)} label={cat.name} />
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', flex: 1, minWidth: 0 }}>{cat.name}</span>
              </label>
            ))
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            onClick={onCreateNew}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 'var(--text-sm)', color: 'var(--color-brand)',
              fontFamily: 'var(--font-sans)', padding: '6px 8px', borderRadius: 'var(--radius-sm)',
              transition: 'background-color var(--duration-fast) var(--ease-smooth)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-brand-softer)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            + 新建分类
          </button>
          <Button variant="secondary" onClick={onClose}>完成</Button>
        </div>
      </div>
    </div>
  )
}
