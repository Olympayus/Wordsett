import type { ReviewCardDTO } from '../../services/reviewService'
import AnswerInput, { type InputKind } from './AnswerInput'

/** 模板 → 作答形态与题面渲染方式。 */
export function inputKindFor(template: ReviewCardDTO['template']): InputKind {
  switch (template) {
    case 'recognize': return 'choice'
    case 'cloze': return 'typed'
    case 'listen': return 'typed'
    default: return 'reveal'
  }
}

export function typedTarget(dto: ReviewCardDTO): string | undefined {
  if (dto.template === 'cloze' || dto.template === 'listen') return String(dto.answer.lemma ?? '')
  return undefined
}

export default function PromptCard({
  dto, letterHighlight, disabled, onSubmit,
}: {
  dto: ReviewCardDTO
  letterHighlight: boolean
  disabled: boolean
  onSubmit: (input: string) => void
}) {
  const p = dto.prompt as Record<string, any>
  return (
    <section aria-label="题目" className="flex flex-col gap-4" style={{ maxWidth: '560px' }}>
      {dto.template === 'recognize' && (
        <>
          <h3 style={{ fontSize: '28px', fontWeight: 600 }}>{p.lemma}</h3>
          {p.phonetic && <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{p.phonetic}</span>}
        </>
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
          style={{ alignSelf: 'flex-start', padding: '10px 18px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', cursor: 'pointer', fontSize: '13px' }}
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
        target={typedTarget(dto)}
        letterHighlight={letterHighlight}
        disabled={disabled}
        onSubmit={onSubmit}
      />
    </section>
  )
}
