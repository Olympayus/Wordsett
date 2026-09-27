import type { ReactNode } from 'react'
import type { ReviewCardDTO, CardContent } from '../../services/reviewService'
import { inputKindFor } from './PromptCard'
import { correctnessLabel } from '../../lib/review/roundStats'
import { NARROW_READING_WIDTH, resultGridColumns } from '../../lib/review/resultLayout'
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
 *
 * 版式（v0.6.3 条目 16）：作答与词条并排成两栏。宽屏左栏是「你的作答 + 三键 + 下一题」、
 * 右栏是完整词条；窄屏回到单列、词条落到最下方——列定义见 lib/review/resultLayout，断点由 ReviewArena 传入。
 * 三键与「下一题」由调用方经 children 递进来（评分状态留在 ReviewArena，这里只管摆放位置），
 * 这样左栏才是完整的一块，键不会被词条顶到屏幕下半。
 */
export default function ResultBlock({ dto, snapshot, lastInput, correct, narrow = false, children }: {
  dto: ReviewCardDTO
  snapshot: CardContent | null
  lastInput: string
  correct: boolean | null
  /** 视口窄于 RESULT_BREAKPOINT：完整词条落到最下方（单列） */
  narrow?: boolean
  /**
   * 排在「你的作答」之后的内容（三键 / 下一题 / 回看态那行），与作答同处左栏。
   * 评分状态与 onRate 仍在 ReviewArena，这里只接收渲染结果。
   */
  children?: ReactNode
}) {
  const revealOnly = inputKindFor(dto.template) === 'reveal'
  return (
    <section aria-label="答题复盘" className="flex flex-col gap-4">
      <div style={{ display: 'grid', gridTemplateColumns: resultGridColumns(narrow), gap: 22, alignItems: 'start' }}>
        {/* 左：作答 + 评分键 + 下一题（揭示型题不渲染作答行，键照常在，见上） */}
        <div className="flex flex-col gap-4">
          {!revealOnly && (
            // 560px 的阅读上限只套在作答行上，不能套在整栏上：窄屏时三键要保持整宽，
            // 被 560px 一起压窄就等于把这次重排想修的「键被推远」换成了「键变挤」。
            // 宽屏不限宽——那根 560px 的线正是两栏放不下的原因。
            <div className="flex flex-col gap-1" style={{ maxWidth: narrow ? `${NARROW_READING_WIDTH}px` : undefined }}>
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
          {children}
        </div>
        {/* 右（宽屏）/ 下（窄屏）：完整词条 */}
        <EntrySnapshot
          wordId={dto.wordId}
          lemma={snapshot?.lemma ?? String(dto.answer.lemma ?? '')}
          phonetic={snapshot?.phonetic ?? ''}
        />
      </div>
    </section>
  )
}
