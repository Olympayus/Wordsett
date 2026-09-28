import type { ReactNode } from 'react'
import type { ReviewCardDTO } from '../../services/reviewService'
import { inputKindFor } from './PromptCard'
import { correctnessLabel } from '../../lib/review/roundStats'

/**
 * 答题复盘块（v0.6.3 条目 4b / 13 / 17 重排；打磨：只管左栏，两栏网格已提到 ReviewArena）。
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
 * **本块现在只渲染左栏**（v0.6.3 打磨）：完整词条那份与题面并排、占右半页，
 * 由 ReviewArena 的网格统一摆（先前两栏做在本块内部，于是题面区的右半边一直是空的、
 * 词条被压在题面下面，看上去是「词条上方有大片空白」）。作答行与三键 / 下一题（children）
 * 仍按原来的顺序排在左栏里，宽度上限仍由左栏那一轨给。
 */
export default function ResultBlock({ dto, lastInput, correct, children }: {
  dto: ReviewCardDTO
  lastInput: string
  correct: boolean | null
  /**
   * 排在「你的作答」之后的内容（三键 / 下一题 / 回看态那行）。
   * 评分状态与 onRate 仍在 ReviewArena，这里只接收渲染结果。
   */
  children?: ReactNode
}) {
  const revealOnly = inputKindFor(dto.template) === 'reveal'
  return (
    <section aria-label="答题复盘" className="flex flex-col gap-4">
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
      {children}
    </section>
  )
}
