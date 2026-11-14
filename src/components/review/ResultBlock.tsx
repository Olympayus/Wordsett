import type { ReactNode } from 'react'
import { FIELD_LABEL_STYLE, LABEL_ON_THEME } from '../../lib/labelStyle'
import { answerDisplay, correctnessLabel } from '../../lib/review/roundStats'

/**
 * 作答复盘面板（v0.7.6 §3.4 重设计）。
 *
 * 结构：一块凹陷面（`--color-surface-sunken`）里装两件事——头行（「作答复盘」标签 + 正误徽标）
 * 与两张白面答案卡（你的作答 / 正确答案）。先前这里是三栏网格，第三栏「正误」自成一格；
 * 现在它的信息上移到头行的徽标里，面板内不再有第二处印正误，故没有第三张卡。
 *
 * 徽标**必须带可读文本**（正确 / 错误 / —）：颜色只是辅助，不能是唯一信号。
 * 三档色全部由既有 success / danger token 经 `color-mix` 调出，与 `AnswerInput` 的选项
 * 对错着色同源（同样是 16% / 14% 白底、70% / 75% 黑字），不引入新的色值。
 *
 * 「你的作答」的值仍由 `answerDisplay` 给出（v0.6.4 条目 8）：揭示型题改成键入型后，
 * 空串只剩「按了跳过」与「没输入直接提交」两个来源，文案统一由那个函数说清，
 * 本块不重新实现「（跳过）」/「（未作答）」。
 *
 * 正误仍读 `correct`（v0.7.2）：它来自记账里的客观结论，不是 rating——
 * rating 只管排期，两者刻意解耦。
 */

/**
 * 三档徽标的底色 / 描边 / 字色。未判定档（`correct === null`，跳过或回看无结论）
 * 退回白面 + 普通描边 + 三级墨：它不该和对错抢眼。
 */
const VERDICT_STYLES = {
  ok: {
    background: 'color-mix(in srgb, var(--color-success) 16%, white)',
    border: '1px solid var(--color-success)',
    color: 'color-mix(in srgb, var(--color-success) 70%, black)',
  },
  no: {
    background: 'color-mix(in srgb, var(--color-danger) 14%, white)',
    border: '1px solid var(--color-danger)',
    color: 'color-mix(in srgb, var(--color-danger) 75%, black)',
  },
  dim: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-tertiary)',
  },
} as const

/** 一张白面答案卡：C1 标签在上、值在下。`minWidth: 0` 让长释义能在格内折行而不是顶宽。 */
function AnswerCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      minWidth: 0,
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      padding: '10px 12px',
    }}>
      <div style={FIELD_LABEL_STYLE}>{label}</div>
      <div style={{ fontSize: '14px', marginTop: '6px', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
        {value}
      </div>
    </div>
  )
}

export default function ResultBlock({ lastInput, skipped, correct, answerText, children, stacked = false }: {
  lastInput: string
  /**
   * 本次（或回看到的）那次作答是否走了「跳过」（v0.6.4）。由 ReviewArena 传入：
   * 本次评分时取 handleRate 收到的标记，回看已答题时取记账里那条的 `skipped`。
   * 不存进 store 就无从在回看态复原——与 lastInput 同一条道理，只是 lastInput 早已在 store 里。
   */
  skipped?: boolean
  correct: boolean | null
  /** 「正确答案」卡片的文本，由调用方用 `correctAnswerText(dto)` 求出。 */
  answerText: string
  /**
   * 手机端答案页把两张卡纵向堆叠（v0.7.6 §3.4）。缺省 false＝桌面并排。
   * 桌面端本版没有调用点传它，留给后续的手机答案页任务接线。
   */
  stacked?: boolean
  /**
   * 排在面板之后的内容（三键 / 下一题 / 回看态那行）。
   * 评分状态与 onRate 仍在 ReviewArena，这里只接收渲染结果。
   */
  children?: ReactNode
}) {
  const verdict = correct === null ? 'dim' : correct ? 'ok' : 'no'
  return (
    <section aria-label="答题复盘" className="flex flex-col gap-4">
      <div style={{
        background: 'var(--color-surface-sunken)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: '14px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <div style={LABEL_ON_THEME}>作答复盘</div>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 10px',
            borderRadius: 'var(--radius-full)',
            fontSize: '11.5px',
            fontWeight: 600,
            lineHeight: 1.5,
            whiteSpace: 'nowrap',
            ...VERDICT_STYLES[verdict],
          }}>
            {correctnessLabel(correct)}
          </span>
        </div>
        {/* 列定义必须写 minmax(0, 1fr)：`1fr` 的隐含 min-width:auto 会让长中文释义把格子顶宽、
            整块横向溢出。手机端改单列堆叠（stacked）。 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: stacked ? '1fr' : 'repeat(2, minmax(0, 1fr))',
          gap: 8,
        }}>
          <AnswerCard label="你的作答" value={answerDisplay({ input: lastInput, skipped })} />
          <AnswerCard label="正确答案" value={answerText} />
        </div>
      </div>
      {children}
    </section>
  )
}
