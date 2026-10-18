import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { FieldValue } from '../../types/field'
import { formatPhonetic } from '../../lib/phonetic'
import { fieldState, FIELD_STATE_BG } from '../../lib/fieldState'
import { FIELD_LABEL_STYLE, BAND_LABEL_COLUMN, BAND_LABEL_GAP } from '../../lib/labelStyle'
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
  /** true = 每个条目占一行（词根多条目用）；false = 同行换行排列（音标用） */
  stacked?: boolean
}

const chipBase: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  borderRadius: 4, padding: '2px 6px', position: 'relative',
  fontFamily: 'var(--font-phonetic)', fontSize: 15, color: 'var(--color-text-primary)',
  transition: 'background-color var(--duration-fast) var(--ease-smooth)',
}
const iconBtn: CSSProperties = {
  width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', background: 'transparent', borderRadius: 3, color: 'var(--color-text-tertiary)',
  cursor: 'pointer', padding: 0,
}

export default function PhoneticArea(props: PhoneticAreaProps) {
  const {
    values, editorMode, editingId, editValue, onEditValueChange, onStartEdit, onSave, onCancelEdit, onAdd, onDelete,
    label = '音标', addLabel = '+ 添加音标', plain = false, stacked = false,
  } = props
  const [rowHover, setRowHover] = useState(false)
  const [chipHover, setChipHover] = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  // 无值时也渲染标签与行外壳（v0.7.4：普通模式原先 return null，编者模式下同一行会突然
  // 长出来、把下方内容整体推下去；两态同高是本组件的前提）。值区为空。

  // 常驻占位 + opacity/visibility 显隐：避免 hover 出入 DOM 引起行重排/页面跳动。
  // visibility 与 WordWorkbench 的 reveal 一致（v0.5.2 修订）：chip 内的编辑/删除是真正的
  // <button>，只靠 opacity 隐藏时它们仍在 Tab 序列与无障碍树里，Tab+Enter 会误触编辑/删除。
  const reveal = (on: boolean): CSSProperties => ({
    opacity: on ? 1 : 0,
    visibility: on ? 'visible' : 'hidden',
    pointerEvents: on ? 'auto' : 'none',
    transition: 'opacity var(--duration-fast) var(--ease-smooth)',
  })

  // 音标 chip 用音标字体/格式化；词根等纯文本模式用正文字体（避免不同字号造成行内布局跳动）
  const displayFont: CSSProperties = plain
    ? { fontFamily: 'var(--font-sans)', fontSize: 13 }
    : { fontFamily: 'var(--font-phonetic)', fontSize: 15 }

  const renderChip = (fv: FieldValue) => {
    const isEditing = editingId === fv.id
    const hovered = chipHover === fv.id
    return (
      <span
        key={fv.id}
        // 标记放在外层 span：让 WordWorkbench 的点外关闭经 closest() 覆盖 input 与 ✓/✕（拖选不退出编辑）
        data-field-edit={isEditing ? 'true' : undefined}
        style={{
          ...chipBase,
          ...displayFont,
          // 编者模式按来源三态给底色（FIELD_STATE_BG：中性 / 已编辑 / 个人），原先是与三态无关的硬编码蓝。
          // 字段卡（v0.7.2 起）已改用形状编码——SourceMark 方点 + SourceBar 左条，不再用底色，
          // 故这里是 FIELD_STATE_BG 仅剩的消费点。普通模式仍只在整行 hover 时给底色。
          background: isEditing ? 'var(--color-brand-soft)' : editorMode
            ? FIELD_STATE_BG[fieldState(fv)]
            : (rowHover ? 'var(--color-surface-sunken)' : 'transparent'),
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
  }

  // 添加控件（v0.5.2 修订）：两种模式都改为 hover 现形（原先编者模式常显，只有普通模式是 hover）。
  // v0.7.4 决定七 7.2：两模式同一枚 18px「＋」。编者模式那枚带字虚线 pill 与普通模式
  // 的加号形状不同、宽度差一倍，「打开编者模式整体压缩」（草稿第 9 条）里有它一份。
  const addTitle = addLabel.replace(/^\+\s*/, '')
  const addControl = (
    <button type="button" title={addTitle} aria-label={addTitle} onClick={onAdd}
      style={{ ...iconBtn, ...reveal(rowHover) }}>
      <Icon name="plus" size={12} />
    </button>
  )

  // 词根（stacked）：添加控件跟到最后一条词根右侧，放不下才换行（宽度决定，不是条数）；
  // 无条目时单独渲染。音标（非 stacked）保持排在所有 chip 之后。
  const lastIndex = values.length - 1
  const headValues = stacked ? values.slice(0, lastIndex) : values
  const tailValue = stacked ? values[lastIndex] : undefined

  return (
    <div
      style={{
        display: 'flex',
        alignItems: stacked ? 'flex-start' : 'center',
        gap: BAND_LABEL_GAP,
        flexWrap: stacked ? 'nowrap' : 'wrap',
      }}
      onMouseEnter={() => setRowHover(true)}
      onMouseLeave={() => { setRowHover(false); setMenuOpenId(null); setChipHover(null) }}
    >
      {/* 标签取「中文释义(n)」那一套字形（FIELD_LABEL_STYLE：粗体 / 一档小字 / 次级墨 / 字距 0.5px），
          与返回页 WordTitleExtras 共用 labelStyle.ts 的列宽 44px 与行距 8px（v0.7.4 决定七 7.3）。
          非 stacked（音标）行整行居中，标签 paddingTop 归 0 才能与 chip 对齐，故按 stacked 分档。 */}
      <span style={{ ...FIELD_LABEL_STYLE, width: `${BAND_LABEL_COLUMN}px`, flexShrink: 0, paddingTop: stacked ? 2 : 0 }}>
        {label}
      </span>

      <div style={{
        display: 'flex',
        flexDirection: stacked ? 'column' : 'row',
        alignItems: stacked ? 'flex-start' : 'center',
        flexWrap: stacked ? 'nowrap' : 'wrap',
        gap: 8,
        minWidth: 0,
      }}>
        {headValues.map(renderChip)}

        {/* 最后一条词根与添加控件同一行：放得下就并肩，词根文本过长时添加控件自动落到下一行 */}
        {tailValue ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, minWidth: 0 }}>
            {renderChip(tailValue)}
            {addControl}
          </span>
        ) : addControl}
      </div>
    </div>
  )
}
