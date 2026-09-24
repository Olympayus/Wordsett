import { useState } from 'react'
import { letterMatches } from '../../lib/review/typed'

export type InputKind = 'choice' | 'typed' | 'reveal'

export default function AnswerInput({
  kind, options, target, letterHighlight, disabled, onSubmit,
}: {
  kind: InputKind
  options?: string[]
  target?: string
  letterHighlight: boolean
  disabled: boolean
  onSubmit: (input: string) => void
}) {
  const [value, setValue] = useState('')
  const [picked, setPicked] = useState<string | null>(null)

  if (kind === 'choice') {
    return (
      <div className="flex flex-col gap-2">
        {(options ?? []).map(opt => {
          const isPicked = picked === opt
          return (
            <button
              key={opt}
              type="button"
              disabled={disabled}
              onClick={() => { setPicked(opt); onSubmit(opt) }}
              style={{
                textAlign: 'left', padding: '8px 12px', borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border)', cursor: disabled ? 'default' : 'pointer',
                background: isPicked ? 'var(--color-brand-soft)' : 'var(--color-surface)',
                color: 'var(--color-text-primary)', fontSize: '13px',
              }}
            >
              {opt}
            </button>
          )
        })}
      </div>
    )
  }

  if (kind === 'reveal') {
    return (
      <button
        type="button"
        onClick={() => onSubmit('')}
        style={{ padding: '8px 16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', cursor: 'pointer', fontSize: '13px' }}
      >
        揭示答案
      </button>
    )
  }

  // 逐位比对着色按码点对齐：letterMatches 不做归一，这里传已 trim 的输入；
  // 覆盖层同样按 Array.from 渲染，两侧下标才能一一对应。
  const matches = letterHighlight && target ? letterMatches(value.trim(), target) : null

  return (
    <div className="flex flex-col gap-2">
      <div style={{ position: 'relative' }}>
        <input
          autoFocus
          disabled={disabled}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && value.trim()) onSubmit(value.trim()) }}
          aria-label="键入答案"
          style={{
            width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)', background: 'transparent',
            color: letterHighlight && target ? 'transparent' : 'var(--color-text-primary)',
            caretColor: 'var(--color-text-primary)', fontSize: '14px', fontFamily: 'inherit',
          }}
        />
        {/* 逐字母着色层：覆盖在输入框之上，逐位渲染正确/错误颜色（不阻断输入） */}
        {matches && (
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, padding: '8px 10px', fontSize: '14px', color: 'var(--color-text-primary)', pointerEvents: 'none', whiteSpace: 'pre' }}>
            {Array.from(value.trim()).map((ch, i) => (
              <span key={i} style={{ color: matches[i] ? 'var(--color-text-primary)' : '#c0705a' }}>{ch}</span>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        disabled={disabled || !value.trim()}
        onClick={() => onSubmit(value.trim())}
        style={{ alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', cursor: disabled || !value.trim() ? 'default' : 'pointer', fontSize: '12px' }}
      >
        提交
      </button>
    </div>
  )
}
