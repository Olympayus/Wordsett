import type { ReactNode } from 'react'
import type { ReviewCardDTO, CardContent } from '../../services/reviewService'
import { inputKindFor } from './PromptCard'
import { correctnessLabel } from '../../lib/review/roundStats'
import { READING_WIDTH, resultGridColumns } from '../../lib/review/resultLayout'
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
 * 版式（v0.6.3 条目 16；打磨：左栏封顶）：作答与词条并排成两栏。宽屏左栏是
 * 「你的作答 + 三键 + 下一题」（封顶 560px，余量全归右栏词条）、右栏是完整词条；
 * 窄屏回到单列、词条落到最下方——列定义见 lib/review/resultLayout，断点由 ReviewArena 传入。
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
            // READING_WIDTH 的阅读上限在窄屏只套在作答行上、宽屏由网格左轨套在整栏上。
            // 两者的区别是**谁来限**：窄屏没有左轨（单列），限宽只能落在作答行这一个盒子上；
            // 宽屏则由 resultGridColumns 的左轨统一封顶，作答行不必再自己写一遍。
            // 宽屏那一版曾按「不能套在整栏上，否则三键会变挤」的理由留空——左轨封顶到 560 之后
            // 三键各约 (560 − 16) / 3 ≈ 181px，仍远宽于「忘了 / 模糊 / 记得」所需的宽度，
            // 那条理由随之失效；而封顶换来的正是右栏词条的 268 → 454px。
            <div className="flex flex-col gap-1" style={{ maxWidth: narrow ? `${READING_WIDTH}px` : undefined }}>
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
