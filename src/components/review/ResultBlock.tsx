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
 *
 * v0.7.2 起本块是三栏，`correct` 来自记账里的客观结论而不是 rating。
 */

/**
 * 对错色 token 化（v0.7.2）：旧代码硬编码 `#5a8a6a` / `#c0705a`，改为主题变量。
 * `dim` 给未判定（`correct === null`）的「正误」栏用——跳过 / 回看未评时是「—」。
 */
const TONES = {
  ok: { color: 'var(--color-success)', fontWeight: 600 },
  no: { color: 'var(--color-danger)', fontWeight: 600 },
  dim: { color: 'var(--color-text-tertiary)' },
} as const

/** 三栏共用的一格：标签 11px 在上、值 14px 在下，三栏因此共用一条标签基线。 */
function Column({ label, tone, children }: { label: string; tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{label}</div>
      <div style={{ fontSize: '14px', marginTop: '6px', lineHeight: 1.5, overflowWrap: 'anywhere', ...(tone ? TONES[tone] : {}) }}>
        {children}
      </div>
    </div>
  )
}

export default function ResultBlock({ lastInput, skipped, correct, answerText, children }: {
  lastInput: string
  /**
   * 本次（或回看到的）那次作答是否走了「跳过」（v0.6.4）。由 ReviewArena 传入：
   * 本次评分时取 handleRate 收到的标记，回看已答题时取记账里那条的 `skipped`。
   * 不存进 store 就无从在回看态复原——与 lastInput 同一条道理，只是 lastInput 早已在 store 里。
   */
  skipped?: boolean
  correct: boolean | null
  /** 「正确答案」栏的文本，由调用方用 `correctAnswerText(dto)` 求出。 */
  answerText: string
  /**
   * 排在「你的作答」之后的内容（三键 / 下一题 / 回看态那行）。
   * 评分状态与 onRate 仍在 ReviewArena，这里只接收渲染结果。
   */
  children?: ReactNode
}) {
  return (
    <section aria-label="答题复盘" className="flex flex-col gap-4">
      {/* 列定义必须写 minmax(0, 1fr)：`1fr` 的隐含 min-width:auto 会让长中文释义把格子顶宽，
          左栏（上限 550px）随之横向溢出（Review Focus 4）。 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-4)' }}>
        <Column label="你的作答">{answerDisplay({ input: lastInput, skipped })}</Column>
        <Column label="正确答案">{answerText}</Column>
        <Column label="正误" tone={correct === null ? 'dim' : correct ? 'ok' : 'no'}>{correctnessLabel(correct)}</Column>
      </div>
      {children}
    </section>
  )
}
