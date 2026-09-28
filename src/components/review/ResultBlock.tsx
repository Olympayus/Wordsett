import { useCallback, useState, type ReactNode } from 'react'
import type { ReviewCardDTO, CardContent } from '../../services/reviewService'
import { inputKindFor } from './PromptCard'
import { correctnessLabel } from '../../lib/review/roundStats'
import { fitsInHalf, resultGridColumns, RESULT_HALF_WIDTH } from '../../lib/review/resultLayout'
import EntrySnapshot from './EntrySnapshot'

/**
 * 答题复盘块（v0.6.3 条目 4b / 13 / 17 重排；打磨：并排 / 置底由快照自己的宽度决定）。
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
 * 版式：作答与词条**要么并排两栏、要么快照整体置底**，由快照自己的最宽不可断行决定
 * （见 EntrySnapshot 的 onIntrinsicWidth 与 resultLayout.fitsInHalf）：
 *   并排时两轨**等分**，各不超过内容区的一半——先前是「左轨定宽 + 右轨弹性」，
 *   定宽的窄轨在宽窗口下会在它下方留出一大片空白，两侧看着就对不齐（用户报的现象）。
 *   视口窄于断点、或快照放不进半栏时走单列，DOM 顺序是作答在前、快照在后，天然「置底」。
 * 三键与「下一题」由调用方经 children 递进来（评分状态留在 ReviewArena，这里只管摆放位置），
 * 这样左栏才是完整的一块，键不会被词条顶到屏幕下半。
 */
export default function ResultBlock({ dto, snapshot, lastInput, correct, viewportWide = false, children }: {
  dto: ReviewCardDTO
  snapshot: CardContent | null
  lastInput: string
  correct: boolean | null
  /** 视口不窄于 RESULT_BREAKPOINT：仍要过了内容这一关才并排（视口只管下限，不管上限） */
  viewportWide?: boolean
  /**
   * 排在「你的作答」之后的内容（三键 / 下一题 / 回看态那行），与作答同处左栏。
   * 评分状态与 onRate 仍在 ReviewArena，这里只接收渲染结果。
   */
  children?: ReactNode
}) {
  const revealOnly = inputKindFor(dto.template) === 'reveal'
  // 快照最宽不可断行的自然宽；0 ＝ 还没量到（首帧 / 快照为空），按放得下处理。
  const [intrinsicWidth, setIntrinsicWidth] = useState(0)
  // 换卡时归零：新快照还没量到，别拿上一张卡的宽度判这一张的版式。
  const [wordId, setWordId] = useState(dto.wordId)
  if (wordId !== dto.wordId) { setWordId(dto.wordId); setIntrinsicWidth(0) }
  const onIntrinsicWidth = useCallback((px: number) => setIntrinsicWidth(px), [])
  const twoColumn = viewportWide && fitsInHalf(intrinsicWidth)

  return (
    <section aria-label="答题复盘" className="flex flex-col gap-4">
      <div style={{ display: 'grid', gridTemplateColumns: resultGridColumns(twoColumn), gap: 22, alignItems: 'start' }}>
        {/* 左：作答 + 评分键 + 下一题（揭示型题不渲染作答行，键照常在，见上）。
            整栏封顶到半栏：并排时它正好是那一轨；单列时上限一样是半栏，作答行不铺满整行。 */}
        <div className="flex flex-col gap-4" style={{ maxWidth: `${RESULT_HALF_WIDTH}px` }}>
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
        </div>
        {/* 右（并排时）/ 下（单列时）：完整词条 */}
        <EntrySnapshot
          wordId={dto.wordId}
          lemma={snapshot?.lemma ?? String(dto.answer.lemma ?? '')}
          phonetic={snapshot?.phonetic ?? ''}
          onIntrinsicWidth={onIntrinsicWidth}
        />
      </div>
    </section>
  )
}
