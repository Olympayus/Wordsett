import type { ReviewCardDTO } from '../../services/reviewService'
import { formatPhonetic } from '../../lib/phonetic'
import AnswerInput, { type InputKind } from './AnswerInput'

/** 模板 → 作答形态与题面渲染方式。 */
export function inputKindFor(template: ReviewCardDTO['template']): InputKind {
  switch (template) {
    case 'recognize': return 'choice'
    case 'cloze': return 'typed'
    case 'recall': return 'typed'   // spec §4.1：中译英也是键入（仅拼写辅助，不判分）
    case 'listen': return 'typed'
    default: return 'reveal'
  }
}

/** 逐字母标红的比对目标；仅键入型题目有（中译英的目标是答案里的单词）。 */
export function typedTarget(dto: ReviewCardDTO): string | undefined {
  if (dto.template === 'cloze' || dto.template === 'recall' || dto.template === 'listen') {
    return String(dto.answer.lemma ?? '')
  }
  return undefined
}

/**
 * 题面行 + 右端「跳过」（spec §2.4）：五种题型统一把跳过放在题面块的右上角。
 * 跳过＝直接记「忘了」（走与评分同一条事务），不落作答原文。
 * showSkip 跟随 disabled：已揭示 / 已作答的卡上按钮消失。
 */
function PromptRow({ children, onSkip, showSkip }: { children: React.ReactNode; onSkip: () => void; showSkip: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {showSkip && (
        <button
          type="button"
          onClick={onSkip}
          style={{
            flexShrink: 0, padding: '3px 10px', borderRadius: 6, fontSize: 11,
            border: '1px solid var(--color-border)', background: 'var(--color-surface-hover)',
            color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
          }}
        >
          跳过
        </button>
      )}
    </div>
  )
}

export default function PromptCard({
  dto, letterHighlight, disabled, onSubmit, onSkip, revealedInput,
}: {
  dto: ReviewCardDTO
  letterHighlight: boolean
  disabled: boolean
  onSubmit: (input: string) => void
  /** 「跳过」：直接记「忘了」，不落作答原文（spec §2.4） */
  onSkip: () => void
  /** 回看态：该卡已提交的作答原文，透传给 AnswerInput 复现判分着色 */
  revealedInput?: string
}) {
  const p = dto.prompt as Record<string, any>
  return (
    <section aria-label="题目" className="flex flex-col gap-4" style={{ maxWidth: '560px' }}>
      {dto.template === 'recognize' && (
        <PromptRow onSkip={onSkip} showSkip={!disabled}>
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 style={{ fontSize: '28px', fontWeight: 600 }}>{p.lemma}</h3>
            {p.phonetic && (
              <span style={{ fontFamily: 'var(--font-phonetic)', fontSize: 15, color: 'var(--color-text-secondary)' }}>
                {formatPhonetic(String(p.phonetic))}
              </span>
            )}
          </div>
        </PromptRow>
      )}
      {dto.template === 'cloze' && (
        <PromptRow onSkip={onSkip} showSkip={!disabled}>
          <p style={{ fontSize: '16px', lineHeight: 1.7 }}>{p.sentence}</p>
        </PromptRow>
      )}
      {dto.template === 'recall' && (
        <PromptRow onSkip={onSkip} showSkip={!disabled}>
          <h3 style={{ fontSize: '22px', fontWeight: 500 }}>{p.translation}</h3>
        </PromptRow>
      )}
      {dto.template === 'english_def' && (
        <PromptRow onSkip={onSkip} showSkip={!disabled}>
          <p style={{ fontSize: '16px', lineHeight: 1.7 }}>{p.definition}</p>
        </PromptRow>
      )}
      {dto.template === 'listen' && (
        <PromptRow onSkip={onSkip} showSkip={!disabled}>
          {/* 听辨题面只有播放按钮：lemma 不得早渲染（v0.6 spec §4.1）。
              命令缺失 / 无音色时静默降级，不产生未捕获拒绝（Review Focus #5）。 */}
          <button
            type="button"
            onClick={async () => {
              try {
                const { invoke } = await import('@tauri-apps/api/core')
                await invoke('speak', { text: String(dto.answer.lemma ?? ''), rate: 1.0 })
              } catch { /* 静默降级 */ }
            }}
            style={{ padding: '10px 18px', borderRadius: 'var(--radius-lg)', border: '1px solid color-mix(in srgb, var(--color-accent) 35%, white)', background: 'var(--color-accent-soft)', color: 'color-mix(in srgb, var(--color-accent) 70%, black)', cursor: 'pointer', fontSize: '13px' }}
          >
            播放读音
          </button>
        </PromptRow>
      )}
      {p.partOfSpeech && dto.template !== 'listen' && (
        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{p.partOfSpeech}</span>
      )}

      <AnswerInput
        kind={inputKindFor(dto.template)}
        options={Array.isArray(p.options) ? p.options.map((o: unknown) => String(o)) : undefined}
        target={typedTarget(dto) ?? (dto.template === 'recognize' ? String((dto.answer as any).translation ?? '') : undefined)}
        letterHighlight={letterHighlight}
        disabled={disabled}
        onSubmit={onSubmit}
        revealedInput={revealedInput}
      />
    </section>
  )
}
