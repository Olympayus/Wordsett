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

export default function PromptCard({
  dto, letterHighlight, disabled, onSubmit, revealedInput,
}: {
  dto: ReviewCardDTO
  letterHighlight: boolean
  disabled: boolean
  onSubmit: (input: string) => void
  /** 回看态：该卡已提交的作答原文，透传给 AnswerInput 复现判分着色 */
  revealedInput?: string
}) {
  const p = dto.prompt as Record<string, any>
  return (
    <section aria-label="题目" className="flex flex-col gap-4" style={{ maxWidth: '560px' }}>
      {dto.template === 'recognize' && (
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 style={{ fontSize: '28px', fontWeight: 600 }}>{p.lemma}</h3>
          {p.phonetic && (
            <span style={{ fontFamily: 'var(--font-phonetic)', fontSize: 15, color: 'var(--color-text-secondary)' }}>
              {formatPhonetic(String(p.phonetic))}
            </span>
          )}
        </div>
      )}
      {dto.template === 'cloze' && <p style={{ fontSize: '16px', lineHeight: 1.7 }}>{p.sentence}</p>}
      {dto.template === 'recall' && <h3 style={{ fontSize: '22px', fontWeight: 500 }}>{p.translation}</h3>}
      {dto.template === 'english_def' && <p style={{ fontSize: '16px', lineHeight: 1.7 }}>{p.definition}</p>}
      {dto.template === 'listen' && (
        <button
          type="button"
          onClick={async () => {
            // TTS 属 00 篇范围，可能尚未落地；命令缺失时静默失败，不产生未捕获拒绝
            try {
              const { invoke } = await import('@tauri-apps/api/core')
              await invoke('speak', { text: String(dto.answer.lemma ?? ''), rate: 1.0 })
            } catch { /* 静默降级 */ }
          }}
          style={{ alignSelf: 'flex-start', padding: '10px 18px', borderRadius: 'var(--radius-lg)', border: '1px solid color-mix(in srgb, var(--color-accent) 35%, white)', background: 'var(--color-accent-soft)', color: 'color-mix(in srgb, var(--color-accent) 70%, black)', cursor: 'pointer', fontSize: '13px' }}
        >
          播放读音
        </button>
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
