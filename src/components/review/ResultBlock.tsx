import type { ReviewCardDTO } from '../../services/reviewService'
import type { CardContent } from '../../services/reviewService'

export default function ResultBlock({ dto, snapshot, lastInput, correct }: {
  dto: ReviewCardDTO
  snapshot: CardContent | null
  lastInput: string
  correct: boolean | null
}) {
  return (
    <section aria-label="答题复盘" className="flex flex-col gap-4" style={{ maxWidth: '560px' }}>
      <div className="flex flex-col gap-1">
        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>你的作答</span>
        <span style={{ fontSize: '14px' }}>
          {lastInput || '（未作答）'}
          {correct !== null && (
            <span style={{ marginLeft: '8px', color: correct ? '#5a8a6a' : '#c0705a', fontSize: '12px' }}>
              {correct ? '正确' : '不正确'}
            </span>
          )}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>完整词条</span>
        <h3 style={{ fontSize: '22px', fontWeight: 600 }}>{snapshot?.lemma ?? String(dto.answer.lemma ?? '')}</h3>
        {snapshot?.phonetic && <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{snapshot.phonetic}</span>}
        {snapshot?.translation && <p style={{ fontSize: '14px' }}>{snapshot.translation}</p>}
        {snapshot?.definition && <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{snapshot.definition}</p>}
        {snapshot?.example && <p style={{ fontSize: '13px', fontStyle: 'italic' }}>{snapshot.example}</p>}
        {!snapshot && <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>快照加载中…</span>}
      </div>

      <div className="flex flex-col gap-1">
        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>下次到期</span>
        <span style={{ fontSize: '13px' }}>
          {dto.sched.dueAt > Date.now() ? formatDue(dto.sched.dueAt) : '评分后更新'}
        </span>
      </div>
    </section>
  )
}

function formatDue(ts: number): string {
  const days = Math.max(1, Math.round((ts - Date.now()) / 86_400_000))
  return days === 1 ? '明天' : `${days} 天后`
}
