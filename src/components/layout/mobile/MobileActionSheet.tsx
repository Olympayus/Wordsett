import { useEffect, useRef } from 'react'
import type { CSSProperties, JSX } from 'react'
import { SHEET_BACK, SHEET_CANCEL, type SheetItem } from '../../../lib/mobileSheets'
import { registerMobilePopup } from '../../../lib/mobilePopups'
import { CHECKBOX_SIZE, checkboxPaint } from '../../ui/CheckBox'

/**
 * 手机底部动作表（v0.7.7 Task 3，spec §3.3）：手机上**所有**「长按 / ⋯ 弹出的表」
 * 的唯一实现——行菜单、添加菜单、分类分配、页签、抽屉行、音标 chip 都走这一张。
 *
 * 结构自上而下：标题 / 副标题（可选）→ 内容（list 或 grid）→ 底部取消。
 * 表体 `maxHeight: 70vh`、内容区自己滚：手机上一条长分类名或一长串分类不能把表
 * 顶出屏幕，标题与取消仍钉在两端。无滑入动画——本仓动效只有底色一档（v0.7.2 §1.4）。
 *
 * 关闭路径三条，全部交给调用点：点遮罩 → `onCancel`；点取消 → `onCancel`；
 * 安卓返回键经 `registerMobilePopup` 登记（`closeTopMobilePopup` 在 `backLayers` 之前消费）。
 * **二级表复用同一个组件**：`onBack` 有值时底部变两格「‹ 返回 / 取消」，返回键也先走
 * `onBack` 回主表，而不是直接关掉整张表。
 *
 * 取值依据：遮罩 `--color-scrim`、层级 `--z-modal`、表体白面 + `--radius-xl` 上圆角、
 * 浮层阴影只消费全站唯一的 `--shadow-overlay`。列表行 44dp、两列格 56dp；
 * 危险项 `--color-danger` 且模型已排在最后（组件只按 `danger` 着色，不重排）；
 * `submenu` 项右侧一枚 `›`，`disabled` 置灰且不响应点击（`<button disabled>`）。
 *
 * v0.7.7 Task 10（spec §3.5）：`checked` 为 boolean 的行是**可勾选项**——行 `role="checkbox"`
 * 且带 `aria-checked`，右侧画一枚与全站同款的勾选方块（`checkboxPaint` 复用 `CheckBox` 的涂装，
 * 组件里不出现第二个可聚焦控件）。点它照常走 `onPick`，**关不关表由调用点决定**：分类分配
 * 表故意不关，好让用户连续勾选。`checked` 未定义的行（其余所有表）逐字不变。
 */

/** 表体最大高度：超过后内容区内部滚动，标题与取消不跟着走。 */
const SHEET_MAX_HEIGHT = '70vh'
/** list 每行高度（spec §3.3）。 */
const LIST_ROW_HEIGHT = 44
/** grid 每格最小高度（spec §3.3）；长文案折行时允许长高。 */
const GRID_CELL_MIN_HEIGHT = 56

/** 表内按钮的公共复位：项目视觉一律内联 style，不引 CSS class。 */
const BUTTON_RESET: CSSProperties = {
  appearance: 'none',
  margin: 0,
  padding: 0,
  width: '100%',
  border: 'none',
  background: 'transparent',
  fontFamily: 'var(--font-sans)',
  textAlign: 'left',
  cursor: 'pointer',
  // 触屏：禁双击缩放与系统按压高亮块
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
}

/** 危险 / 置灰 / 常态三档文字色。置灰优先于危险（禁用项本来就不该执行）。 */
function itemColor(item: SheetItem): string {
  if (item.disabled) return 'var(--color-text-tertiary)'
  if (item.danger) return 'var(--color-danger)'
  return 'var(--color-text-primary)'
}

/** list 行：左对齐、行高 44、右侧可带 `›`；行间一档发丝线，最后一行不留线（交给底栏上缘）。 */
function listRowStyle(item: SheetItem, isLast: boolean): CSSProperties {
  return {
    ...BUTTON_RESET,
    minHeight: `${LIST_ROW_HEIGHT}px`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    // 竖向 10px：单行时总高仍由 minHeight 撑到 44；分类名之类的长文案折行时随内容长高，
    // 不用固定 height 把它裁掉。
    padding: '10px 16px',
    fontSize: 15,
    lineHeight: 1.25,
    color: itemColor(item),
    opacity: item.disabled ? 0.6 : 1,
    cursor: item.disabled ? 'default' : 'pointer',
    borderBottom: isLast ? 'none' : '1px solid var(--color-border)',
  }
}

/** grid 格：两列、格高 56、暖中性底 + 发丝描边、文字居中、长文案折行。 */
function gridCellStyle(item: SheetItem): CSSProperties {
  return {
    ...BUTTON_RESET,
    minHeight: `${GRID_CELL_MIN_HEIGHT}px`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 10px',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 1.35,
    // 长英文 / 长中文都能在格内折行，不把两列顶出横向滚动
    overflowWrap: 'anywhere',
    background: 'var(--color-surface-raised)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)',
    color: itemColor(item),
    opacity: item.disabled ? 0.6 : 1,
    cursor: item.disabled ? 'default' : 'pointer',
  }
}

/** 底部取消 / 返回格：44dp、等分；两格之间一条竖线。 */
function footerButtonStyle(divider: boolean): CSSProperties {
  return {
    ...BUTTON_RESET,
    flex: '1 1 0',
    minWidth: 0,
    width: 'auto',
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    fontSize: 15,
    color: 'var(--color-text-secondary)',
    borderLeft: divider ? '1px solid var(--color-border)' : 'none',
  }
}

interface Props {
  open: boolean
  /** 被长按对象的文本（行菜单）或「加到「容器名」」，让用户手指离开后仍能确认目标。 */
  title?: string
  subtitle?: string
  items?: SheetItem[]
  /** 默认 `'list'`；添加菜单用 `'grid'`。分类分配表刻意用 `'list'`——逐行勾选要看全分类名。 */
  mode?: 'list' | 'grid'
  onPick: (key: string) => void
  onCancel: () => void
  /** 有值 = 二级表：底部左格显示「‹ 返回」，安卓返回键也先回主表。 */
  onBack?: () => void
}

export default function MobileActionSheet({
  open, title, subtitle, items, mode = 'list', onPick, onCancel, onBack,
}: Props): JSX.Element | null {
  // 返回键登记**不能**直接用 `useMobilePopup(open, onBack ?? onCancel)`：它的登记 effect
  // 只依赖 `[open]`，而主表 / 二级表是同一个实例、切换时 `open` 始终为 true。
  // `closeTopMobilePopup` 是「先出栈再 close」，返回键把登记项 pop 掉后 effect 不会重跑，
  // 于是第二次返回就穿透到 `backLayers`（表还开着，返回键却已对它不可见）。
  // 故这里自己登记，依赖 `[open, hasBack]`：**层切换（二级 ↔ 主表）必须重新登记，
  // 否则返回键只消费一次**。close 仍走 ref，避免内联函数导致每次渲染都注销再登记。
  const hasBack = Boolean(onBack)
  const closeRef = useRef(onBack ?? onCancel)
  useEffect(() => { closeRef.current = onBack ?? onCancel })
  useEffect(() => {
    if (!open) return
    return registerMobilePopup(() => closeRef.current())
  }, [open, hasBack])

  // 表是瞬态浮层：关闭即卸载（没有需要保住的滚动位置），也就不必像抽屉那样常挂。
  if (!open) return null

  const rows = items ?? []
  const hasHeader = Boolean(title || subtitle)

  return (
    <div
      // 遮罩：点空白关闭。表体自己 stopPropagation，点内容不会穿透到这一层。
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal)',
        background: 'var(--color-scrim)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title ?? '操作'}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxHeight: SHEET_MAX_HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
          boxShadow: 'var(--shadow-overlay)',
          // 手势条安全区：与底栏同一条理由——给表体补下边距，取消不压在手势条上。
          paddingBottom: 'env(safe-area-inset-bottom)',
          fontFamily: 'var(--font-sans)',
          overflow: 'hidden',
        }}
      >
        {hasHeader && (
          <div style={{ flexShrink: 0, padding: '14px 16px 12px', borderBottom: '1px solid var(--color-border)' }}>
            {title && (
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: 'var(--color-text-primary)',
                  lineHeight: 1.3,
                  // 标题单行截断（spec §3.3）：长词面 / 长容器名不把表头撑成两行
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {title}
              </div>
            )}
            {subtitle && (
              <div
                style={{
                  marginTop: title ? 4 : 0,
                  fontSize: 12,
                  color: 'var(--color-text-tertiary)',
                  lineHeight: 1.4,
                }}
              >
                {subtitle}
              </div>
            )}
          </div>
        )}

        {/* 内容区：唯一可滚的一段。`minHeight: 0` 是 flex 列里让 overflow 生效的前提。 */}
        <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
          {mode === 'grid' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, padding: 16 }}>
              {rows.map(item => (
                <button
                  key={item.key}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => onPick(item.key)}
                  style={gridCellStyle(item)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : (
            rows.map((item, i) => {
              // `checked` 有值 = 可勾选项（分类分配表）：行本身即勾选框，点一下切换、不关表。
              const checkable = typeof item.checked === 'boolean'
              return (
                <button
                  key={item.key}
                  type="button"
                  role={checkable ? 'checkbox' : undefined}
                  aria-checked={checkable ? item.checked : undefined}
                  disabled={item.disabled}
                  onClick={() => onPick(item.key)}
                  style={listRowStyle(item, i === rows.length - 1)}
                >
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{item.label}</span>
                  {checkable && (
                    // 与全站 CheckBox 同一套涂装（选中 = 填色块、未选 = 空心描边），
                    // 但这里只是**画**出来的一枚标记、不是第二个控件：点击目标仍是整行按钮。
                    <span
                      aria-hidden="true"
                      style={{
                        flexShrink: 0,
                        width: CHECKBOX_SIZE,
                        height: CHECKBOX_SIZE,
                        borderRadius: 'var(--radius-sm)',
                        ...checkboxPaint({ checked: item.checked!, hover: false, color: 'var(--color-brand)' }),
                      }}
                    />
                  )}
                  {item.submenu && (
                    <span aria-hidden="true" style={{ flexShrink: 0, fontSize: 18, lineHeight: 1, color: 'var(--color-text-tertiary)' }}>
                      ›
                    </span>
                  )}
                </button>
              )
            })
          )}
        </div>

        {/* 底栏：`onBack` 有值 → 两格「‹ 返回 / 取消」；否则通栏「取消」。 */}
        <div style={{ flexShrink: 0, display: 'flex', borderTop: '1px solid var(--color-border)' }}>
          {onBack && (
            <button type="button" onClick={onBack} style={footerButtonStyle(false)}>
              {SHEET_BACK}
            </button>
          )}
          <button type="button" onClick={onCancel} style={footerButtonStyle(Boolean(onBack))}>
            {SHEET_CANCEL}
          </button>
        </div>
      </div>
    </div>
  )
}
