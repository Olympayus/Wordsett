import type { ReactNode } from 'react'
import { answerDisplay, correctnessLabel } from '../../lib/review/roundStats'

/**
 * 答题复盘块（v0.6.3 条目 4b / 13 / 17 重排；v0.6.4 条目 8；打磨：只管左栏，两栏网格已提到 ReviewArena）。
 *
 * 「下次到期」整块已删（条目 13）：它报的是这张卡**评完分之后**的排期，而本块渲染在评分键之前，
 * 于是按评分键之前显示的是 dto.sched.dueAt 或「评分后更新」、按完才变真值——一个
 * 「先占位再换真值」的闪动。到期信息的全局视图在复习首页的「明日压力」图里。
 *
 * 「你的作答」行不再按题型门控（v0.6.4 条目 8）：先前揭示型题（english_def）整行不渲染
 * （那种题只有「揭示答案」键、作答原文恒为空，一味印「（未作答）」会被读成「我跳过了这题」）。
 * 现在揭示型题已改成键入型，英文释义也要键入，空串只剩两个来源——按了「跳过」，
 * 或没输入直接提交。文案由 `answerDisplay` 统一出，两处消费点（这里与小结明细表）共用一份，
 * 于是空串不再是需要藏起来的特例，「（跳过）」与「（未作答）」各自说清自己。
 *
 * **本块现在只渲染左栏**（v0.6.3 打磨）：完整词条那份与题面并排、占右半页，
 * 由 ReviewArena 的网格统一摆（先前两栏做在本块内部，于是题面区的右半边一直是空的、
 * 词条被压在题面下面，看上去是「词条上方有大片空白」）。作答行与三键 / 下一题（children）
 * 仍按原来的顺序排在左栏里，宽度上限仍由左栏那一轨给。
 *
 * `dto` prop 随之删除（v0.6.4）：揭掉 `revealOnly` 那道门控后，本块再没有一处读它
 * （题面与词条快照都从 ReviewArena 走），留着就是一条永远为真的死 prop。
 */
export default function ResultBlock({ lastInput, skipped, correct, children }: {
  lastInput: string
  /**
   * 本次（或回看到的）那次作答是否走了「跳过」（v0.6.4）。由 ReviewArena 传入：
   * 本次评分时取 handleRate 收到的标记，回看已答题时取记账里那条的 `skipped`。
   * 不存进 store 就无从在回看态复原——与 lastInput 同一条道理，只是 lastInput 早已在 store 里。
   */
  skipped?: boolean
  correct: boolean | null
  /**
   * 排在「你的作答」之后的内容（三键 / 下一题 / 回看态那行）。
   * 评分状态与 onRate 仍在 ReviewArena，这里只接收渲染结果。
   */
  children?: ReactNode
}) {
  return (
    <section aria-label="答题复盘" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>你的作答</span>
        <span style={{ fontSize: '14px' }}>
          {answerDisplay({ input: lastInput, skipped })}
          {correct !== null && (
            <span style={{ marginLeft: '8px', color: correct ? '#5a8a6a' : '#c0705a', fontSize: '12px' }}>
              {correctnessLabel(correct)}
            </span>
          )}
        </span>
      </div>
      {children}
    </section>
  )
}
