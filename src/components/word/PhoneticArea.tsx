import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { FieldValue } from '../../types/field'
import { formatPhonetic } from '../../lib/phonetic'
import Icon from '../icons'

interface PhoneticAreaProps {
  values: FieldValue[]
  editorMode: boolean
  editingId: string | null
  editValue: string
  onEditValueChange: (v: string) => void
  onStartEdit: (fv: FieldValue) => void
  onSave: () => void
  onCancelEdit: () => void
  onAdd: () => void
  onDelete: (fv: FieldValue) => void
  // 复用参数（词根等同类型复用本组件）：仅标题文案 / 添加文案 / 正文与音标字体不同
  label?: string
  addLabel?: string
  plain?: boolean
}

const chipBase: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  borderRadius: 4, padding: '2px 6px', position: 'relative',
  fontFamily: 'var(--font-phonetic)', fontSize: 15, color: 'var(--color-text-primary)',
  transition: 'background-color 150ms var(--ease-smooth)',
}
const iconBtn: CSSProperties = {
  width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', background: 'transparent', borderRadius: 3, color: 'var(--color-text-tertiary)',
  cursor: 'pointer', padding: 0,
}
const addChip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-text-tertiary)',
  fontSize: 13, cursor: 'pointer', border: '1px dashed var(--color-border-strong)',
  borderRadius: 9999, padding: '1px 8px', background: 'transparent',
  fontFamily: 'var(--font-sans)',
}

export default function PhoneticArea(props: PhoneticAreaProps) {
  const {
    values, editorMode, editingId, editValue, onEditValueChange, onStartEdit, onSave, onCancelEdit, onAdd, onDelete,
    label = '音标', addLabel = '+ 添加音标', plain = false,
  } = props
  const [rowHover, setRowHover] = useState(false)
  const [chipHover, setChipHover] = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  // 普通模式无内容 → 隐藏整区
  if (!editorMode && values.length === 0) return null

  const reveal = (on: boolean): CSSProperties => ({
    opacity: on ? 1 : 0, pointerEvents: on ? 'auto' : 'none',
    transition: 'opacity 150ms var(--ease-smooth)',
  })

  // 音标 chip 用音标字体/格式化；词根等纯文本模式用正文字体（避免不同字号造成行内布局跳动）
  const displayFont: CSSProperties = plain
    ? { fontFamily: 'var(--font-sans)', fontSize: 13 }
    : { fontFamily: 'var(--font-phonetic)', fontSize: 15 }

  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
      onMouseEnter={() => setRowHover(true)}
      onMouseLeave={() => { setRowHover(false); setMenuOpenId(null); setChipHover(null) }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.5px', color: 'var(--color-text-secondary)' }}>{label}</span>

      {values.map(fv => {
        const isEditing = editingId === fv.id
        const hovered = chipHover === fv.id
        return (
          <span
            key={fv.id}
            style={{
              ...chipBase,
              ...displayFont,
              background: isEditing ? 'var(--color-brand-soft)' : editorMode
                ? (hovered ? '#DCE5F1' : '#E8EEF6')
                : (rowHover ? '#F4F1EC' : 'transparent'),
            }}
            onMouseEnter={() => setChipHover(fv.id)}
            onMouseLeave={() => setChipHover(null)}
          >
            {isEditing ? (
              <input
                autoFocus
                value={editValue}
                onChange={e => onEditValueChange(e.target.value)}
                onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancelEdit() }}
                style={{
                  fontFamily: displayFont.fontFamily, fontSize: displayFont.fontSize, color: 'var(--color-text-primary)',
                  border: '1px solid var(--color-brand)', borderRadius: 4, padding: '1px 6px',
                  background: 'var(--color-surface)', outline: 'none', width: 140,
                }}
              />
            ) : (
              <span
                role="button" tabIndex={0}
                onClick={() => editorMode && onStartEdit(fv)}
                onDoubleClick={() => !editorMode && onStartEdit(fv)}
                onKeyDown={e => { if (e.key === 'Enter') onStartEdit(fv) }}
                title={editorMode ? '点击编辑' : '双击编辑'}
                style={{ cursor: 'pointer' }}
              >
                {plain ? fv.value : formatPhonetic(fv.value)}
              </span>
            )}

            {isEditing && (
              <>
                <button type="button" title="保存" onClick={onSave} style={iconBtn}>✓</button>
                <button type="button" title="取消" onClick={onCancelEdit} style={iconBtn}>✕</button>
              </>
            )}

            {!isEditing && editorMode && (
              <span style={reveal(hovered)}>
                <button type="button" title="编辑" onClick={() => onStartEdit(fv)} style={iconBtn}><Icon name="edit" size={12} /></button>
                <button type="button" title="删除" onClick={() => onDelete(fv)} style={iconBtn}><Icon name="trash" size={12} /></button>
              </span>
            )}

            {!isEditing && !editorMode && (
              <span style={{ ...reveal(rowHover), position: 'relative', display: 'inline-flex' }}>
                <button
                  type="button" title="更多操作"
                  onClick={() => setMenuOpenId(menuOpenId === fv.id ? null : fv.id)}
                  style={iconBtn}
                >
                  <Icon name="more" size={12} />
                </button>
                {menuOpenId === fv.id && (
                  <span
                    style={{
                      position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 'var(--z-dropdown)',
                      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                      borderRadius: 6, boxShadow: 'var(--shadow-overlay)', padding: 4, minWidth: 96,
                    }}
                  >
                    <button
                      type="button" onClick={() => { setMenuOpenId(null); onStartEdit(fv) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', border: 'none', background: 'transparent', borderRadius: 4, fontSize: 13, color: 'var(--color-text-primary)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                    >编辑</button>
                    <button
                      type="button" onClick={() => { setMenuOpenId(null); onDelete(fv) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', border: 'none', background: 'transparent', borderRadius: 4, fontSize: 13, color: 'var(--color-danger)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                    >删除</button>
                  </span>
                )}
              </span>
            )}
          </span>
        )
      })}

      {/* 常驻占位 + opacity 显隐：避免 hover 出入 DOM 引起行重排/页面跳动 */}
      <span style={{ ...addChip, ...reveal(editorMode || rowHover) }} onClick={onAdd}>{addLabel}</span>
    </div>
  )
}
