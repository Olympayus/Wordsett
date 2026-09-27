import type { ReviewCardDTO, CardContent } from '../../services/reviewService'
import { inputKindFor } from './PromptCard'
import { correctnessLabel } from '../../lib/review/roundStats'
import EntrySnapshot from './EntrySnapshot'

/**
 * 答题复盘块（v0.6.3 条目 4b / 13 / 17 重排）。
 *
 * 「下次到期」整块已删（条目 13）：它报的是这张卡**评完分之后**的排期，而本块渲染在评分键之前，
 * 于是按评分键之前显示的是 dto.sched.dueAt 或「评分后更新」、按完才变真值——一个
 * 「先占位再换真值」的闪动。到期信息的全局视图在复习首页的「明日压力」图里。
 *
 * 「你的作答」行在揭示型题（english_def）上不渲染（条目 4b）：那种题只有「揭示答案」键，
 * 作答原文恒为空串，原先一律印「（未作答）」会读成「我跳过了这题」。
 * SummaryPanel 的明细表早就有「（跳过）/（揭示后评分）」两支，这里索性整行不渲染——
 * 揭示型题没有作答可展示，correct 也恒为 null，两个内容都不存在。
 */
export default function ResultBlock({ dto, snapshot, lastInput, correct }: {
  dto: ReviewCardDTO
  snapshot: CardContent | null
  lastInput: string
  correct: boolean | null
}) {
  const revealOnly = inputKindFor(dto.template) === 'reveal'
  return (
    <section aria-label="答题复盘" className="flex flex-col gap-4" style={{ maxWidth: '560px' }}>
      {!revealOnly && (
        <div className="flex flex-col gap-1">
          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>你的作答</span>
          <span style={{ fontSize: '14px' }}>
            {lastInput || '（未作答）'}
            {correct !== null && (
              <span style={{ marginLeft: '8px', color: correct ? '#5a8a6a' : '#c0705a', fontSize: '12px' }}>
                {correctnessLabel(correct)}
              </span>
            )}
          </span>
        </div>
      )}

      <EntrySnapshot
        wordId={dto.wordId}
        lemma={snapshot?.lemma ?? String(dto.answer.lemma ?? '')}
        phonetic={snapshot?.phonetic ?? ''}
      />
    </section>
  )
}
