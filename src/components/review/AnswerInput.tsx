import { useState } from 'react'
import { letterMatches } from '../../lib/review/typed'
import SquareButton from '../ui/SquareButton'

export type InputKind = 'choice' | 'typed' | 'reveal'

// 复习区可点击元素的暖橙体系（v0.6.1 §2.2）。四组值都从 --color-accent 派生：
// 底色用 -soft，描边用 accent 往白里压一阶，文字是 accent 压暗后的同色相深色。
const ORANGE_BG = 'var(--color-accent-soft)'
const ORANGE_BG_HOVER = 'color-mix(in srgb, var(--color-accent-soft) 80%, var(--color-accent))'
const ORANGE_BG_PICKED = 'color-mix(in srgb, var(--color-accent-soft) 62%, var(--color-accent))'
const ORANGE_BORDER = 'color-mix(in srgb, var(--color-accent) 35%, white)'
const ORANGE_BORDER_HOVER = 'color-mix(in srgb, var(--color-accent) 60%, white)'
const ORANGE_TEXT = 'color-mix(in srgb, var(--color-accent) 70%, black)'

// 判分着色（v0.6.1 §2.3）：只用于选择题，作答后才有。
const WRONG_BG = 'color-mix(in srgb, var(--color-danger) 14%, white)'
const RIGHT_BG = 'color-mix(in srgb, var(--color-success) 16%, white)'
const NEUTRAL_BG = 'var(--color-surface)'
const NEUTRAL_BORDER = 'var(--color-border)'

export default function AnswerInput({
  kind, options, target, letterHighlight, disabled, onSubmit, revealedInput,
}: {
  kind: InputKind
  options?: string[]
  target?: string
  letterHighlight: boolean
  disabled: boolean
  onSubmit: (input: string) => void
  /**
   * 回看态：该卡已提交的作答原文。`!== undefined`（含 `''`）时切到已判分形态并按结果着色；
   * 组件本身不因此停止响应点击——是否可点由调用方的 `disabled` 决定。
   */
  revealedInput?: string
}) {
  const [value, setValue] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)

  if (kind === 'choice') {
    const chosen = revealedInput ?? picked
    const shown = revealedInput !== undefined
    return (
      <div className="flex flex-col gap-2">
        {(options ?? []).map(opt => {
          const isPicked = chosen === opt
          const isRight = shown && opt === String(target ?? '')
          // 三态：已判分时按对错/中性着色；未判分时按「选中 / 悬停 / 默认」着色
          const bg = shown
            ? (isRight ? RIGHT_BG : isPicked ? WRONG_BG : NEUTRAL_BG)
            : (isPicked ? ORANGE_BG_PICKED : hover === opt ? ORANGE_BG_HOVER : ORANGE_BG)
          const border = shown
            ? (isRight ? 'var(--color-success)' : isPicked ? 'var(--color-danger)' : NEUTRAL_BORDER)
            : (isPicked ? 'var(--color-accent)' : hover === opt ? ORANGE_BORDER_HOVER : ORANGE_BORDER)
          const color = shown
            ? (isRight ? 'color-mix(in srgb, var(--color-success) 70%, black)'
              : isPicked ? 'color-mix(in srgb, var(--color-danger) 75%, black)'
              : 'var(--color-text-tertiary)')
            : ORANGE_TEXT
          return (
            <button
              key={opt}
              type="button"
              disabled={disabled}
              onMouseEnter={() => setHover(opt)}
              onMouseLeave={() => setHover(null)}
              onClick={() => { setPicked(opt); onSubmit(opt) }}
              style={{
                textAlign: 'left', padding: '8px 12px', borderRadius: 'var(--radius-lg)',
                border: `1px solid ${border}`, cursor: disabled ? 'default' : 'pointer',
                background: bg, color, fontSize: '13px',
              }}
            >
              {opt}
              {shown && (isRight || isPicked) && (
                <span style={{ float: 'right', fontSize: '11px' }}>
                  {isRight && isPicked ? '你选的 · 正确' : isRight ? '正确' : '你选的'}
                </span>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  if (kind === 'reveal') {
    return (
      /* 保持原来的撑满宽：这一支原先直接作为 <section className="flex flex-col"> 的 flex 项，
         靠 align-items 默认的 stretch 铺满，与下面「提交」那支的 flex-start 是两回事。
         本任务只换按钮形态，不改此处原有的排布，故不套 alignSelf 包裹。
         tone='surface'：该 section 与 PromptCard 都不设底，最近一个设了底的祖先是
         <main> 的 --color-surface（纯白）。 */
      <SquareButton tone="surface" onClick={() => onSubmit('')}>揭示答案</SquareButton>
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
      {/* alignSelf 落在包裹用的 <div> 上而非按钮本身：SquareButton 是 inline-flex，
          放进上面这个 flex-col 里默认会被拉满宽（原来的原生 <button> 靠 alignSelf 躲过）。 */}
      <div style={{ alignSelf: 'flex-start' }}>
        <SquareButton tone="surface" disabled={disabled || !value.trim()} onClick={() => onSubmit(value.trim())}>
          提交
        </SquareButton>
      </div>
    </div>
  )
}
