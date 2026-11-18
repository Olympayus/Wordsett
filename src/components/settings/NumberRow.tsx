import type { ReactNode } from 'react'
import { hasCoarsePointer } from '../../lib/pointer'
import { touchInputStyles } from '../../lib/touchInput'
import Icon from '../icons'
import Tooltip from '../ui/Tooltip'

/**
 * 「标签＋说明」在左、数字框在右的一行（原为 ReviewSettings 的局部组件）。
 *
 * 抽出来是因为 v0.7.0 把音色与语速拆成独立的「语音」分区后，两个分区各要一份：
 * 留两处副本迟早会漂——本文件就是那唯一一份。
 *
 * items-center：输入框垂直居中于左列那两行之中（v0.6.1 §2.7）。
 * 早先输入框与第一行标签对齐、说明文字溢出到框下方，视觉重心偏上。
 */
export default function NumberRow({ label, hint, value, min, max, step, integer, defaultValue, onChange, disabled = false }: {
  label: string
  /** 说明文字。**可选**：2026-10-03 起「语音」分区按用户要求去掉了所有注释文字，
   *  留空即为纯标签行。v0.7.10 收尾改为 ReactNode：保留率那行要把「右侧可填…」
   *  整句放到第二行（`<br />`），不能让它在折行处被拆成两半。 */
  hint?: ReactNode
  value: number; min: number; max: number; step: number
  /** 整型项：step 只是输入框提示，不拦手输，故在这里显式取整（保留率与语速是有意的小数，不传）。 */
  integer?: boolean
  /**
   * 「恢复默认」的目标值（v0.7.10 收尾）。**传了才渲染那枚图标键**——
   * 复习分区的四个自填项都传，语音分区的语速行不传（它不属于「复习的四个设置项」）。
   */
  defaultValue?: number
  /** 整行置灰且输入框不可编辑（Task 14：系统 TTS 不可用时语音页的语速行）。
   *  默认 false，既有调用点行为不变。 */
  disabled?: boolean
  onChange: (v: number) => void
}) {
  // 触摸输入档（v0.7.10 §7.4）：设置页在手机外壳与桌面共用本组件，没有 `touch` prop，
  // 按主指针判断；桌面鼠标环境为空对象，样式逐字不变。
  const touch = hasCoarsePointer()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: disabled ? 0.45 : 1 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: '13px' }}>{label}</span>
        {hint && (
          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>{hint}</span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {defaultValue !== undefined && (
          <Tooltip content="恢复默认">
            <button
              type="button"
              aria-label="恢复默认"
              disabled={disabled}
              onClick={() => onChange(defaultValue)}
              onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'var(--color-surface-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              style={{
                width: 24, height: 24, flexShrink: 0, padding: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', background: 'transparent', borderRadius: 'var(--radius-sm)',
                cursor: disabled ? 'not-allowed' : 'pointer', color: 'var(--color-text-secondary)',
                transition: 'background-color var(--duration-fast) var(--ease-smooth), color var(--duration-fast) var(--ease-smooth)',
              }}
            >
              <Icon name="rotate-ccw" size={14} />
            </button>
          </Tooltip>
        )}
        <input
          type="number" value={value} min={min} max={max} step={step}
          disabled={disabled}
          onChange={e => {
            if (disabled) return
            const v = Number(e.target.value)
            if (Number.isNaN(v)) return
            const clamped = Math.min(max, Math.max(min, v))
            onChange(integer ? Math.round(clamped) : clamped)
          }}
          style={{ width: '90px', flexShrink: 0, padding: '4px 8px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-strong)', background: 'transparent', color: 'inherit', fontSize: '13px', cursor: disabled ? 'not-allowed' : undefined, ...touchInputStyles(touch) }}
        />
      </div>
    </div>
  )
}
