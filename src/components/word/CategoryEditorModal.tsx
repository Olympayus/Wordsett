import { useState, useEffect, useRef, type CSSProperties } from 'react'
import { useFocusTrap } from '../../lib/useFocusTrap'
import { useCategoryStore } from '../../stores/categoryStore'
import { useUiStore } from '../../stores/uiStore'
import type { Category } from '../../types/category'
import Icon from '../icons'
import { Button } from '../ui/Button'
import CheckBox from '../ui/CheckBox'

// 规格 §6.2 分类色板（16 色，Task 16：8 → 16）：唯一色值来源是 tokens.css 的
// --color-cat-1..16（v0.7.2 §6 D 类：裸 hex 收进 token，此处只引用变量名，不再复制一份 hex）。
// 选中某色后落库的就是这个变量名字符串——渲染层（CategoryCapsule 的色块、设置页分类行）
// 用 `background: <color>` 直接吃它，CSS 会解析变量。
export const CATEGORY_COLORS = Array.from({ length: 16 }, (_, i) => `var(--color-cat-${i + 1})`)

// 兼容 v0.7.2 之前落库的 hex 色值（老行存的是这 8 个 hex，新行存 token 名）。
// **仅**用于把「编辑已有分类」载入的旧值归一到 token，好让色板能正确高亮当前选中色——
// 否则老分类打开编辑框会一个色都不亮。待库里不再有旧行（或补一次数据迁移）即可删除本表。
const LEGACY_HEX = ['#7A7368', '#6B8E7F', '#4A6FA5', '#8B6A8B', '#C17A4E', '#B85450', '#5A7A8C', '#8B7355']
const normalizeColor = (c: string): string => {
  const i = LEGACY_HEX.indexOf(c.toUpperCase())
  return i >= 0 ? CATEGORY_COLORS[i] : c
}

interface Props {
  open: boolean
  category: Category | null   // null = 新建模式；非 null = 编辑已有分类
  wordId?: string             // 当前单词（编辑模式「从此单词移除」用）；standalone 模式省略
  onClose: () => void
  onSaved?: (category: Category) => void
}

export default function CategoryEditorModal({ open, category, wordId, onClose, onSaved }: Props) {
  const { createCategory, updateCategory, deleteCategory, assignToWord, removeFromWord } = useCategoryStore()
  const [name, setName] = useState('')
  const [color, setColor] = useState(CATEGORY_COLORS[0])
  const [description, setDescription] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [error, setError] = useState('')

  // 每次打开时按当前分类初始化表单
  useEffect(() => {
    if (!open) return
    setName(category?.name ?? '')
    setColor(normalizeColor(category?.color ?? CATEGORY_COLORS[0]))
    setDescription(category?.description ?? '')
    setIsDefault(category?.isDefault ?? false)
    setError('')
  }, [open, category])

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

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) { setError('分类名称必填'); return }
    if (category) {
      await updateCategory(category.id, {
        name: trimmed, color, description: description.trim() || null, isDefault,
      })
      onClose()
      return
    }
    const created = await createCategory({
      name: trimmed, color, description: description.trim() || undefined, isDefault,
    })
    if (!created) { setError('保存失败，请重试'); return }
    if (created && wordId) await assignToWord(wordId, created.id)  // 新建分类自动归入当前单词（standalone 无 wordId 时不归词）
    onClose()
    onSaved?.(created)
  }

  const handleRemoveFromWord = async () => {
    if (!category || !wordId) return
    await removeFromWord(wordId, category.id)
    onClose()
  }

  const handleDelete = async () => {
    if (!category) return
    if (!(await useUiStore.getState().confirm({ title: '删除分类', message: `确定删除分类“${category.name}”吗？将从所有单词移除该分类。`, danger: true }))) return
    await deleteCategory(category.id)
    onClose()
  }

  const inputStyle: CSSProperties = {
    width: '100%', height: '36px', padding: '0 12px',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)', background: 'var(--color-surface)',
    color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)',
  }
  const labelStyle: CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: '6px' }

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
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)' }}>
            {category ? '编辑分类' : '新建分类'}
          </div>
          <button
            type="button" aria-label="关闭" title="关闭" onClick={onClose}
            style={{ width: '28px', height: '28px', border: 'none', background: 'transparent', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={labelStyle}>分类名称</div>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-brand)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-border)' }}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={labelStyle}>分类颜色</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {CATEGORY_COLORS.map((c, i) => (
              <button
                key={c}
                type="button"
                aria-label={`选择颜色 ${i + 1}`}
                onClick={() => setColor(c)}
                style={{
                  width: '28px', height: '28px', borderRadius: '50%', cursor: 'pointer',
                  border: `2px solid ${c === color ? 'var(--color-text-primary)' : 'transparent'}`,
                  background: c, transition: 'border-color var(--duration-fast) var(--ease-smooth), background-color var(--duration-fast) var(--ease-smooth)',
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={labelStyle}>分类描述 <span style={{ color: 'var(--color-text-tertiary)' }}>（可选）</span></div>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-brand)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-border)' }}
            style={inputStyle}
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: '16px', cursor: 'pointer' }}>
          <CheckBox checked={isDefault} onChange={v => setIsDefault(v)} label="设为默认分类" />
          设为默认分类（新建单词自动归入）
        </label>

        {error && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)', marginBottom: '8px' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '8px', marginTop: '20px' }}>
          {/* 左侧列：从此单词移除（上） + 删除分类（左下角） */}
          {category && wordId && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
              <button
                type="button"
                onClick={handleRemoveFromWord}
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)',
                  fontFamily: 'var(--font-sans)', padding: '6px 8px', borderRadius: 'var(--radius-sm)',
                  whiteSpace: 'nowrap',
                  transition: 'color var(--duration-fast) var(--ease-smooth), background-color var(--duration-fast) var(--ease-smooth)',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-danger)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
              >
                从此单词移除
              </button>
              <button
                type="button"
                onClick={handleDelete}
                style={{
                  background: 'var(--color-surface)',
                  color: 'var(--color-danger)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '14px',
                  lineHeight: 1.5,
                  whiteSpace: 'nowrap',
                  transition: 'background-color var(--duration-fast) var(--ease-smooth)',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--color-danger) 8%, transparent)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-surface)' }}
              >
                删除分类
              </button>
            </div>
          )}
          {/* 右侧：取消 + 保存 并列 */}
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            <Button variant="secondary" onClick={onClose}>取消</Button>
            <Button onClick={handleSave}>保存</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
