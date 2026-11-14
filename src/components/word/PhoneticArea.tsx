import { useState, useRef, useLayoutEffect } from 'react'
import type { CSSProperties, MouseEvent } from 'react'
import type { FieldValue } from '../../types/field'
import { formatPhonetic } from '../../lib/phonetic'
import { fieldState, FIELD_STATE_BG } from '../../lib/fieldState'
import { FIELD_LABEL_STYLE, BAND_LABEL_COLUMN, BAND_LABEL_GAP } from '../../lib/labelStyle'
import { MEASURE_STYLE, MEASURE_MIN_WIDTH, measureTextWidth } from '../../lib/measureText'
import { hitAreaStyle } from '../../lib/mobileHitArea'
import { unitSheetItems } from '../../lib/mobileSheets'
import { useTouchLongPress } from '../../lib/useTouchLongPress'
import MobileActionSheet from '../layout/mobile/MobileActionSheet'
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
  /**
   * 手机外壳（v0.7.7 Task 9）：长按 chip 弹底部表（编辑 / 删除），故 hover 现形的
   * 编辑 / 删除钮、行尾 ⋯ 与「＋」一律不渲染；命中区只纵向扩到 44。桌面不传，逐字不变。
   */
  touch?: boolean
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

// chip 内输入框的内边距：**探针与输入框两侧共用这同一个字符串**（`ChipBody` 内再消费）。
// 本文件的输入框配方是「1px 边 ＋ 上下 1px、左右 6px」，与工作区那套（`MEASURE_INPUT_CLASS`
// 的 `px-3 py-1.5`）不同，故这里自备一份、不往 lib 里养第二套类名。竖向那 1px 是 chip 原有的
// 高度配方：编辑态若把它抹成 0，chip 会在进编辑那一刻上下缩 2px（与工作区补回 `py-1.5` 是
// 同一类零位移问题）；探针绝对定位、竖向 padding 不参与宽度测量，故一份字符串两边都安全。
// 横向 padding 与 border 两侧同源，就不会出现「探针量的比输入框实际占的窄一截」。
const INPUT_PADDING = '1px 6px'

// 操作簇（编辑 ＋ 删除，或普通模式的 ⋯）的宽度——**三种形态同为 36px**：两枚 18px 按钮
// 并排、簇内无 gap ＝ 36；普通模式虽只有一枚 18px 按钮，外层壳仍保留 36px 并把按钮右对齐；
// 编辑态不渲染任何交互控件（保存 / 取消已归导航条），但**这一格必须照样留着**：撤掉占位会让
// chip 当场短 36px、同一行里后继的 chip 整片往左跳——与 v0.5.2 定下的「行尾操作簇常驻占位」
// 是同一条不变量。chip 根节点的 `gap: 4` 在三种形态里都只贡献同一个 gap（整个簇是一个子项），
// 故不参与这段算术。
const ACTION_CLUSTER_WIDTH = 36

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
  touch: boolean
  onEditValueChange: (v: string) => void
  onStartEdit: (fv: FieldValue) => void
  onSave: () => void
  onCancelEdit: () => void
  onDelete: (fv: FieldValue) => void
  onHover: (id: string | null) => void
  onMenu: (id: string | null) => void
  onLongPress: (fv: FieldValue) => void
}) {
  const { fv, isEditing, hovered, displayFont, plain, editorMode, rowHover, editValue, menuOpenId, touch } = props
  // 量的是**编辑中的值**（`editValue`，不是 `fv.value`）——初始时它等于被替换那段文字，之后随输入
  // 增长；量 `fv.value` 的话整个编辑过程宽度一动不动（那是评审抓到的 bug）。音标模式显示的是
  // `formatPhonetic` 的产物（比 `fv.value` 宽：`[` `]` 等），也要照样格式化后再量。
  const displayText = plain ? editValue : formatPhonetic(editValue)
  const probeRef = useRef<HTMLSpanElement>(null)
  const [textWidth, setTextWidth] = useState(0)
  useLayoutEffect(() => { if (isEditing) setTextWidth(measureTextWidth(probeRef.current)) }, [isEditing, editValue])

  // 长按 chip（v0.7.7 Task 9，spec §3.1）：每枚 chip 各挂一份 hook。`ChipBody` 本来就是
  // 为装 hook 抽出来的组件（见上方注释），这里直接加一份即可，hook 数按 chip 数稳定。
  // `disabled: !touch || isEditing` 是两条门：桌面完全惰性（右键系统菜单照旧）；编辑态
  // 也不挂——输入框里的长按属于系统选词 / 输入法手势。
  // 长按成立后浏览器仍会补发一次 click（触屏合成事件）——编辑模式下那一下会顺带进编辑，
  // 故与 `TabButton` / `UnitActivation` 同一套一次性闸门：长按置位、紧随其后的一次 click
  // 在捕获阶段吞掉，下一次 pointerdown 复位。
  const swallowClickRef = useRef(false)
  const { handlers: longPressHandlers } = useTouchLongPress(() => {
    swallowClickRef.current = true
    navigator.vibrate?.(10)
    props.onLongPress(fv)
  }, { disabled: !touch || isEditing })
  const longPressProps = {
    ...longPressHandlers,
    onPointerDownCapture: () => { swallowClickRef.current = false },
    onClickCapture: (e: MouseEvent<HTMLElement>) => {
      if (!swallowClickRef.current) return
      swallowClickRef.current = false
      e.preventDefault()
      e.stopPropagation()
    },
  }
  return (
    <span
      // 标记放在外层 span：让 WordWorkbench 的点外关闭经 closest() 覆盖拖选中的输入框
      data-field-edit={isEditing ? 'true' : undefined}
      // 触摸手势挂在 chip 本体上（命中区覆盖层在正文 span 里，pointer 事件照样冒泡到这里）；
      // 桌面不展开任何一份——DOM 与既有行为逐字不变。
      {...(touch ? longPressProps : null)}
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
          <span ref={probeRef} aria-hidden="true" style={{ ...MEASURE_STYLE, ...displayFont, padding: INPUT_PADDING }}>{displayText}</span>
          <input
            autoFocus
            value={editValue}
            onChange={e => props.onEditValueChange(e.target.value)}
            onKeyDown={e => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') props.onSave(); if (e.key === 'Escape') props.onCancelEdit() }}
            style={{
              fontFamily: displayFont.fontFamily, fontSize: displayFont.fontSize, color: 'var(--color-text-primary)',
              // border 与 `MEASURE_STYLE` 是同一行字（'1px solid var(--color-brand)'），padding 与
              // 探针同一个字符串——量出来的 border-box 就是输入框实占的那一段，起点零位移。
              border: '1px solid var(--color-brand)', borderRadius: 4, padding: INPUT_PADDING,
              background: 'var(--color-surface)', outline: 'none',
              minWidth: MEASURE_MIN_WIDTH, ...(textWidth ? { width: textWidth } : null),
            }}
          />
        </>
      ) : (
        <span
          role="button" tabIndex={0}
          // 单击 / 双击与桌面语义分家（v0.7.7 Task 9，spec §3.8 / §3.1）：手机上单击**维持现状**
          // （不再一按就进编辑——编辑已由长按表的「编辑」承担），双击才进编辑。桌面逐字不变。
          // 照抄 `EditableValue.tsx` 与 `WordWorkbench` 正文的既有写法；着色分支仍读裸 `editorMode`。
          onClick={() => !touch && editorMode && props.onStartEdit(fv)}
          onDoubleClick={() => (touch || !editorMode) && props.onStartEdit(fv)}
          onKeyDown={e => { if (e.key === 'Enter') props.onStartEdit(fv) }}
          title={touch || !editorMode ? '双击编辑' : '点击编辑'}
          // 触摸下这里才是命中区的包含块（`position: relative`）：覆盖层挂在正文 span 内部，
          // 点击 / 长按都照常冒泡到本 span 与 chip 本体。放在 chip 根上会盖住正文、把
          // 「点击编辑」也一起挡住（绝对定位层压在非定位子元素之上）。
          style={{ cursor: 'pointer', ...(touch ? { position: 'relative' as const } : null) }}
        >
          {/* 触摸命中区（v0.7.7 Task 9）：**只纵向**扩到 44px，横向仍是正文自己的宽度——
              绝不像默认 44×44 那样向两侧伸手压住相邻 chip（Review Focus 2）。绝对定位、
              不进布局；不进编辑态（输入框要自己接指针）。 */}
          {touch && <span aria-hidden="true" style={hitAreaStyle({ verticalOnly: true })} />}
          {plain ? fv.value : formatPhonetic(fv.value)}
        </span>
      )}

      {/* v0.7.4 任务 14：编辑中的「保存 / 取消」整个搬到词条导航条（WorkbenchNavBar），
          chip 里不再留这枚 ✓/✕ 对——行内留着它们，进编辑那一刻 chip 就要长出一截。
          键盘照旧：input 自己的 `onKeyDown` 认 Enter 保存 / Esc 取消（并守住 isComposing）。

          但**那一格位置不能跟着一起消失**：两态 chip 的宽度必须逐字相同，故编辑态摆一枚
          与操作簇同宽的惰性占位（不可见、不接指针、不进无障碍树）。占位之外不放任何可点
          控件——行内再留 ✓/✕ 就等于让保存有两条路，与「导航条接管」的决定相抵。

          v0.7.7 Task 9：手机上整簇**条件不渲染**（不是 display:none）——编辑 / 删除 / ⋯
          都已由长按底部表承担，chip 里不留任何常驻或隐形的控件；编辑态的 36px 占位也一并
          撤掉，因为触摸下三种形态都没有这一格，宽度在形态之间仍然一致。 */}
      {!touch && (isEditing ? (
        <span aria-hidden="true" style={{ width: ACTION_CLUSTER_WIDTH, flexShrink: 0, visibility: 'hidden', pointerEvents: 'none' }} />
      ) : editorMode ? (
        <span style={reveal(hovered)}>
          <button type="button" title="编辑" onClick={() => props.onStartEdit(fv)} style={iconBtn}><Icon name="edit" size={12} /></button>
          <button type="button" title="删除" onClick={() => props.onDelete(fv)} style={iconBtn}><Icon name="trash" size={12} /></button>
        </span>
      ) : (
        // 普通模式只有一枚 ⋯，但外框仍占满 ACTION_CLUSTER_WIDTH 并右对齐——三种形态
        // （普通 / 编者 / 编辑中）宽度逐字相同，切换模式时 chip 与后继内容零位移。
        <span style={{ ...reveal(rowHover), position: 'relative', display: 'inline-flex', width: ACTION_CLUSTER_WIDTH, flexShrink: 0, justifyContent: 'flex-end' }}>
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
      ))}
    </span>
  )
}

export default function PhoneticArea(props: PhoneticAreaProps) {
  const {
    values, editorMode, editingId, editValue, onEditValueChange, onStartEdit, onSave, onCancelEdit, onAdd, onDelete,
    label = '音标', addLabel = '+ 添加音标', plain = false, stacked = false, touch = false,
  } = props
  const [rowHover, setRowHover] = useState(false)
  const [chipHover, setChipHover] = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  // 手机长按底部表的目标 chip（v0.7.7 Task 9）。桌面没有置位路径；三条关闭路径
  // （选编辑 / 选删除 / 取消或点遮罩）都要清掉它，`MobileActionSheet` 不自行关闭。
  const [sheetFv, setSheetFv] = useState<FieldValue | null>(null)

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
      touch={touch}
      onEditValueChange={onEditValueChange}
      onStartEdit={onStartEdit}
      onSave={onSave}
      onCancelEdit={onCancelEdit}
      onDelete={onDelete}
      onHover={setChipHover}
      onMenu={setMenuOpenId}
      onLongPress={setSheetFv}
    />
  )

  // 添加控件（v0.5.2 修订）：两种模式都改为 hover 现形（原先编者模式常显，只有普通模式是 hover）。
  // v0.7.4 决定七 7.2：两模式同一枚 18px「＋」。编者模式那枚带字虚线 pill 与普通模式
  // 的加号形状不同、宽度差一倍，「打开编者模式整体压缩」（草稿第 9 条）里有它一份。
  // v0.7.7 Task 9：手机上不渲染（不是藏起来）——触摸下没有 hover，白占一格且按不中。
  const addTitle = addLabel.replace(/^\+\s*/, '')
  const addControl = touch ? null : (
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

  // 底部表标题 = 被长按 chip 的显示文本（与 chip 上看到的一致：音标走 formatPhonetic、
  // 词根原样）；空值（正在编辑的那条）退到字段名。
  const sheetTitle = sheetFv ? (plain ? sheetFv.value : formatPhonetic(sheetFv.value)) : ''

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
      {/* 标签取 C1 字形（FIELD_LABEL_STYLE：10.5px / 600 / 字距 0.1em；白面用 `--color-label`，
          主题面用次级文字色），与返回页 WordTitleExtras 共用 labelStyle.ts 的列宽 44px 与行距 8px
          （v0.7.4 决定七 7.3；v0.7.6 收进 C1）。非 stacked（音标）行整行居中，标签 paddingTop 归 0
          才能与 chip 对齐，故按 stacked 分档。 */}
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

      {/* 手机长按底部表（v0.7.7 Task 9）。条目模型与桌面单位行同一份 `unitSheetItems()`
          （编辑 / 删除）；`onPick` 按 chip 自己解析——编辑走 `onStartEdit`、删除走 `onDelete`，
          都是该 chip 原本就有的回调，不另写一套。**先清 state 再执行**：`MobileActionSheet`
          不自行关闭，三个分支（编辑 / 删除 / 其它）都必须让表消失。桌面 `sheetFv` 恒为 null，
          这里一个节点都不渲染。 */}
      {sheetFv && (
        <MobileActionSheet
          open
          title={sheetTitle.trim() ? sheetTitle : label}
          items={unitSheetItems()}
          onPick={key => {
            const fv = sheetFv
            setSheetFv(null)
            if (key === 'edit') onStartEdit(fv)
            else if (key === 'delete') onDelete(fv)
          }}
          onCancel={() => setSheetFv(null)}
        />
      )}
    </div>
  )
}
