import { useEffect, useRef, useState } from 'react'
import { useFocusTrap } from '../../lib/useFocusTrap'
import { useCategoryStore } from '../../stores/categoryStore'
import { getWordCategories } from '../../services/categoryService'
import Icon from '../icons'
import { Button } from '../ui/Button'
import CheckBox from '../ui/CheckBox'
import MobileActionSheet from '../layout/mobile/MobileActionSheet'
import { SHEET_CREATE_CATEGORY, categoryAssignItems } from '../../lib/mobileSheets'

interface Props {
  open: boolean
  wordId: string
  onClose: () => void
  onCreateNew: () => void
  /**
   * v0.7.7 Task 10（spec §3.5）：`mobile` 时改用 `MobileActionSheet` 的列表形态——
   * 已属分类逐行带勾选态、点一下即增删、**切换不关表**；末行「＋ 新建分类」。
   * 不设焦点陷阱、不画居中弹窗。桌面（默认）逐字不变。
   */
  variant?: 'desktop' | 'mobile'
}

export default function CategoryAssignModal({ open, wordId, onClose, onCreateNew, variant = 'desktop' }: Props) {
  const { categories, assignToWord, removeFromWord } = useCategoryStore()
  const isMobile = variant === 'mobile'

  // 勾选态必须是**本弹窗自己的 `wordId`** 的一份（v0.7.7 fix Critical 2）：全局
  // `wordCategoryIds` 只描述工作台当前选中的词，抽屉里对非选中词打开本弹窗时它是另一个词的
  // 状态——勾会画错，第一次切换也会按错的已属关系反向执行。打开 / 换词时重新拉取。
  const [assignedIds, setAssignedIds] = useState<string[]>([])
  useEffect(() => {
    if (!open) return
    let alive = true
    void getWordCategories(wordId).then(cats => {
      if (alive) setAssignedIds(cats.map(c => c.id))
    })
    return () => { alive = false }
  }, [open, wordId])

  // Esc 关闭（§11 a11y 键盘可达）。手机端关表走底部「取消」或安卓返回键
  // （表自己经 `registerMobilePopup` 登记），不额外接 Esc。
  useEffect(() => {
    if (!open || isMobile) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, isMobile])

  // 手机版是底部动作表，没有居中的焦点容器、也不该把焦点锁在表里；hook 仍无条件调用
  // （React 规则），只是 `open` 传假。
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(open && !isMobile, panelRef)

  if (!open) return null

  const assigned = new Set(assignedIds)

  const toggle = async (categoryId: string) => {
    if (assigned.has(categoryId)) {
      await removeFromWord(wordId, categoryId)
      setAssignedIds(prev => prev.filter(id => id !== categoryId))
    } else {
      await assignToWord(wordId, categoryId)
      setAssignedIds(prev => (prev.includes(categoryId) ? prev : [...prev, categoryId]))
    }
  }

  if (isMobile) {
    return (
      <MobileActionSheet
        open
        title="选择分类"
        items={categoryAssignItems(categories, assignedIds)}
        onPick={key => {
          if (key === SHEET_CREATE_CATEGORY) {
            // 裁定 10：先关分配表，再走既有的新建分类入口（进 `CategoryEditorModal`）。
            onClose()
            onCreateNew()
            return
          }
          // 切换**不关表**：已属 → 移除、未属 → 加入，可连续勾选；取消 / 安卓返回才关。
          void toggle(key)
        }}
        onCancel={onClose}
      />
    )
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'var(--color-scrim)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ width: '360px', maxWidth: '90vw', padding: '24px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-overlay)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)' }}>选择分类</div>
          <button
            type="button" aria-label="关闭" onClick={onClose}
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
              // v0.7.2 §6 规则 2：可点提示不再用品牌蓝，hover 转主文字色 + 悬停底。
              fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-sans)', padding: '6px 8px', borderRadius: 'var(--radius-sm)',
              transition: 'background-color var(--duration-fast) var(--ease-smooth)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
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
