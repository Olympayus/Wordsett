import { useState, useRef, useLayoutEffect } from 'react'
import type { CSSProperties } from 'react'
import type { FieldValue } from '../../types/field'
import { formatPhonetic } from '../../lib/phonetic'
import { fieldState, FIELD_STATE_BG } from '../../lib/fieldState'
import { FIELD_LABEL_STYLE, BAND_LABEL_COLUMN, BAND_LABEL_GAP } from '../../lib/labelStyle'
import { MEASURE_STYLE, MEASURE_MIN_WIDTH, measureTextWidth } from '../../lib/measureText'
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

// 常驻占位 + opacity/visibility 显隐（v0.5.2 修订，本文件原有的那份）：chip 内的编辑 / 删除是
// 真正的 <button>，只靠 opacity 隐藏时它们仍在 Tab 序列与无障碍树里，Tab+Enter 会误触编辑 / 删除；
// visibility:hidden 同时移出两者，且不占位差、布局照旧保留。抽到模块级是因为 chip 本体已是组件。
function reveal(on: boolean): CSSProperties {
  return {
    opacity: on ? 1 : 0,
    visibility: on ? 'visible' : 'hidden',
    pointerEvents: on ? 'auto' : 'none',
    transition: 'opacity var(--duration-fast) var(--ease-smooth)',
  }
}

/**
 * 单枚 chip（v0.7.4 任务 14）：**抽成组件**只为装 hook——编辑态的量宽要
 * `useRef` + `useState` + `useLayoutEffect`，而 `renderChip` 是 `PhoneticArea` 里的一个
 * **普通函数**（每条音标 / 词根调一次）。直接在里面调 hook 等于「有条件的 hook」：
 * 编辑中的那一条走一遍 hook、其余几条一条不走，数量随「有几条在编辑」变化——React 会当场
 * 报 hook 顺序错乱。抽成组件后 hook 在 `ChipBody` 体内无条件执行，与调用次数无关。
 */
function ChipBody(props: {
  fv: FieldValue
  isEditing: boolean
  hovered: boolean
  displayFont: CSSProperties
  plain: boolean
  editorMode: boolean
  rowHover: boolean
  editValue: string
  menuOpenId: string | null
  onEditValueChange: (v: string) => void
  onStartEdit: (fv: FieldValue) => void
  onSave: () => void
  onCancelEdit: () => void
  onDelete: (fv: FieldValue) => void
  onHover: (id: string | null) => void
  onMenu: (id: string | null) => void
}) {
  const { fv, isEditing, hovered, displayFont, plain, editorMode, rowHover, editValue, menuOpenId } = props
  // 量的是**编辑中的值**（`editValue`，不是 `fv.value`）——初始时它等于被替换那段文字，之后随输入
  // 增长；量 `fv.value` 的话整个编辑过程宽度一动不动（那是评审抓到的 bug）。音标模式显示的是
  // `formatPhonetic` 的产物（比 `fv.value` 宽：`[` `]` 等），也要照样格式化后再量。
  const displayText = plain ? editValue : formatPhonetic(editValue)
  const probeRef = useRef<HTMLSpanElement>(null)
  const [textWidth, setTextWidth] = useState(0)
  useLayoutEffect(() => { if (isEditing) setTextWidth(measureTextWidth(probeRef.current)) }, [isEditing, editValue])
  return (
    <span
      // 标记放在外层 span：让 WordWorkbench 的点外关闭经 closest() 覆盖拖选中的输入框
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
      onMouseEnter={() => props.onHover(fv.id)}
      onMouseLeave={() => props.onHover(null)}
    >
      {isEditing ? (
        <>
          <span ref={probeRef} aria-hidden="true" style={{ ...MEASURE_STYLE, ...displayFont }}>{displayText}</span>
          <input
            autoFocus
            value={editValue}
            onChange={e => props.onEditValueChange(e.target.value)}
            onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') props.onSave(); if (e.key === 'Escape') props.onCancelEdit() }}
            style={{
              fontFamily: displayFont.fontFamily, fontSize: displayFont.fontSize, color: 'var(--color-text-primary)',
              border: '1px solid var(--color-brand)', borderRadius: 4, padding: '1px 6px',
              background: 'var(--color-surface)', outline: 'none',
              minWidth: MEASURE_MIN_WIDTH, ...(textWidth ? { width: textWidth } : null),
            }}
          />
        </>
      ) : (
        <span
          role="button" tabIndex={0}
          onClick={() => editorMode && props.onStartEdit(fv)}
          onDoubleClick={() => !editorMode && props.onStartEdit(fv)}
          onKeyDown={e => { if (e.key === 'Enter') props.onStartEdit(fv) }}
          title={editorMode ? '点击编辑' : '双击编辑'}
          style={{ cursor: 'pointer' }}
        >
          {plain ? fv.value : formatPhonetic(fv.value)}
        </span>
      )}

      {/* v0.7.4 任务 14：编辑中的「保存 / 取消」整个搬到词条导航条（WorkbenchNavBar），
          chip 里不再留这枚 ✓/✕ 对——行内留着它们，进编辑那一刻 chip 就要长出一截。
          键盘照旧：input 自己的 `onKeyDown` 认 Enter 保存 / Esc 取消（并守住 isComposing）。 */}

      {!isEditing && editorMode && (
        <span style={reveal(hovered)}>
          <button type="button" title="编辑" onClick={() => props.onStartEdit(fv)} style={iconBtn}><Icon name="edit" size={12} /></button>
          <button type="button" title="删除" onClick={() => props.onDelete(fv)} style={iconBtn}><Icon name="trash" size={12} /></button>
        </span>
      )}

      {!isEditing && !editorMode && (
        <span style={{ ...reveal(rowHover), position: 'relative', display: 'inline-flex' }}>
          <button
            type="button" title="更多操作"
            onClick={() => props.onMenu(menuOpenId === fv.id ? null : fv.id)}
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
                type="button" onClick={() => { props.onMenu(null); props.onStartEdit(fv) }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', border: 'none', background: 'transparent', borderRadius: 4, fontSize: 13, color: 'var(--color-text-primary)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
              >编辑</button>
              <button
                type="button" onClick={() => { props.onMenu(null); props.onDelete(fv) }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', border: 'none', background: 'transparent', borderRadius: 4, fontSize: 13, color: 'var(--color-danger)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
              >删除</button>
            </span>
          )}
        </span>
      )}
    </span>
  )
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

  // 音标 chip 用音标字体/格式化；词根等纯文本模式用正文字体（避免不同字号造成行内布局跳动）
  const displayFont: CSSProperties = plain
    ? { fontFamily: 'var(--font-sans)', fontSize: 13 }
    : { fontFamily: 'var(--font-phonetic)', fontSize: 15 }

  const renderChip = (fv: FieldValue) => (
    <ChipBody key={fv.id} fv={fv}
      isEditing={editingId === fv.id}
      hovered={chipHover === fv.id}
      displayFont={displayFont}
      plain={plain}
      editorMode={editorMode}
      rowHover={rowHover}
      editValue={editValue}
      menuOpenId={menuOpenId}
      onEditValueChange={onEditValueChange}
      onStartEdit={onStartEdit}
      onSave={onSave}
      onCancelEdit={onCancelEdit}
      onDelete={onDelete}
      onHover={setChipHover}
      onMenu={setMenuOpenId}
    />
  )

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
