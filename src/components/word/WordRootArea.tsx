import { useState } from 'react'
import type { FieldValue } from '../../types/field'
import Icon from '../icons'

interface WordRootAreaProps {
  values: FieldValue[]           // 根级 word_root 容器（每组一个容器，子项 word_root_item）
  editorMode: boolean
  editingId: string | null
  editValue: string
  onEditValueChange: (v: string) => void
  onStartEdit: (fv: FieldValue) => void
  onSave: () => void
  onCancelEdit: () => void
  onAdd: () => void
  onDelete: (fv: FieldValue) => void
}

export default function WordRootArea(props: WordRootAreaProps) {
  const { values, editorMode, editValue, onEditValueChange, onStartEdit, onSave, onCancelEdit, onAdd, onDelete } = props
  const [rowHover, setRowHover] = useState(false)

  if (!editorMode && values.length === 0) return null

  const item = (fv: FieldValue) => {
    const isEditing = fv.id === props.editingId
    return (
      <span key={fv.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
        {isEditing ? (
          <input autoFocus value={editValue} onChange={e => onEditValueChange(e.target.value)}
            onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancelEdit() }}
            style={{ fontFamily: 'var(--font-sans)', fontSize: 13, border: '1px solid var(--color-brand)', borderRadius: 4, padding: '1px 6px', outline: 'none', width: 220 }} />
        ) : (
          <span role="button" tabIndex={0} onClick={() => editorMode && onStartEdit(fv)}
            onDoubleClick={() => !editorMode && onStartEdit(fv)}
            title={editorMode ? '点击编辑' : '双击编辑'} style={{ cursor: editorMode ? 'pointer' : undefined }}>
            {fv.value}
          </span>
        )}
        {isEditing && <>
          <button type="button" title="保存" onClick={onSave} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-brand)' }}>✓</button>
          <button type="button" title="取消" onClick={onCancelEdit} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-tertiary)' }}>✕</button>
        </>}
        {!isEditing && editorMode && (
          <span style={{ display: 'inline-flex', gap: 2 }}>
            <button type="button" title="编辑" onClick={() => onStartEdit(fv)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-tertiary)' }}><Icon name="edit" size={12} /></button>
            <button type="button" title="删除" onClick={() => onDelete(fv)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-tertiary)' }}><Icon name="trash" size={12} /></button>
          </span>
        )}
      </span>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}
      onMouseEnter={() => setRowHover(true)}
      onMouseLeave={() => setRowHover(false)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.5px', color: 'var(--color-text-secondary)' }}>词根</span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {values.flatMap(container =>
            (container.children ?? []).map(c => item(c))
          )}
        </span>
        {(editorMode || rowHover) && (
          <button type="button" onClick={onAdd}
            style={{ fontSize: 13, color: 'var(--color-text-tertiary)', cursor: 'pointer', border: '1px dashed var(--color-border-strong)', borderRadius: 9999, padding: '1px 8px', background: 'transparent', fontFamily: 'var(--font-sans)' }}>
            + 添加词根
          </button>
        )}
      </div>
    </div>
  )
}