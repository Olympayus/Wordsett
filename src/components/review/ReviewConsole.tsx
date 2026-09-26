import { accuracyText } from '../../lib/review/scopeLabel'

/**
 * 左栏顶部小控制台（v0.6.1 §3.1，v0.6.2 §4.1 扩容）。
 *
 * 两态：空闲态报全局量（今日待复习 / 新词 / 薄弱词），做题态报范畴 / 做题进度 / 正确率。
 * 边界：只放计数、进度与范畴名——零词条内容，不放 lemma（v0.6 spec §2.2）。
 *
 * v0.6.2 的关键变化：做题态那个数字是**做题进度**（已答数），不是光标位置。
 * 顶部导航栏的「第 n / N 题」才是光标位置，两者刻意分开（条目 14）——
 * 用箭头翻看旧题时进度不该变。
 */
export interface ConsoleSession {
  total: number
  answeredCount: number
  correctCount: number
  scopeLabel: string
}

export default function ReviewConsole({ overview, weakCount, session }: {
  overview: { total: number; newCount: number } | null
  weakCount: number
  session: ConsoleSession | null
}) {
  if (session) {
    const { total, answeredCount, correctCount, scopeLabel } = session
    const pct = total > 0 ? (answeredCount / total) * 100 : 0
    return (
      <div style={{ border: '1px solid var(--color-border)', background: 'var(--color-brand-softer)', borderRadius: 'var(--radius-lg)', padding: '9px 10px', marginBottom: '8px' }}>
        <div style={{ display: 'flex', gap: 8, fontSize: '10px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
          <span>本次范畴</span>
          <span style={{ marginLeft: 'auto', color: 'var(--color-text-primary)' }}>{scopeLabel}</span>
        </div>
        <div style={{ fontSize: '16px', fontWeight: 600 }}>
          已答 {answeredCount} <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--color-text-secondary)' }}>/ {total}</span>
        </div>
        <div style={{ height: '3px', marginTop: '8px', background: 'var(--color-border)', borderRadius: '2px' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-brand)', borderRadius: '2px' }} />
        </div>
        <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
          正确 {correctCount} · {accuracyText(answeredCount, correctCount)}
        </div>
      </div>
    )
  }

  return (
    <div style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface-raised)', borderRadius: 'var(--radius-lg)', padding: '9px 10px', marginBottom: '8px' }}>
      <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>今日</div>
      <div style={{ fontSize: '16px', fontWeight: 600 }}>
        {overview?.total ?? 0} <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--color-text-secondary)' }}>张待复习</span>
      </div>
      <div style={{ display: 'flex', gap: '10px', marginTop: '5px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
        <span>其中新词 {overview?.newCount ?? 0}</span>
        <span>薄弱词 {weakCount}</span>
      </div>
    </div>
  )
}
