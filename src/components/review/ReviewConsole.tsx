import type { Template } from '../../lib/review/types'

/** 题型枚举 → 中文档面名（spec §3.1 的「题型名」）。键即 Template 全集，将来加题型时这里编译不过。 */
const TEMPLATE_LABEL: Record<Template, string> = {
  recognize: '认读',
  cloze: '填空',
  recall: '中译英',
  english_def: '英文释义题',
  listen: '听辨',
}

/**
 * 左栏顶部小控制台（v0.6.1 §3.1）。
 *
 * 两态：空闲态报全局量（今日待复习 / 新词 / 薄弱词），做题态报本轮进度与题型构成。
 * 边界：只放计数、进度与题型名——零词条内容，不放 lemma（v0.6 spec §2.2）。
 */
export interface ConsoleSession {
  index: number
  total: number
  remaining: number
  template: Template
}

export default function ReviewConsole({ overview, weakCount, session }: {
  overview: { total: number; newCount: number } | null
  weakCount: number
  session: ConsoleSession | null
}) {
  if (session) {
    const pct = session.total > 0 ? ((session.index + 1) / session.total) * 100 : 0
    return (
      <div style={{ border: '1px solid var(--color-border)', background: 'var(--color-brand-softer)', borderRadius: 'var(--radius-lg)', padding: '9px 10px', marginBottom: '8px' }}>
        <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>本轮进度</div>
        <div style={{ fontSize: '16px', fontWeight: 600 }}>
          第 {session.index + 1} <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--color-text-secondary)' }}>/ {session.total} 题</span>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '5px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
          <span>剩余 {session.remaining}</span>
          <span>{TEMPLATE_LABEL[session.template]}</span>
        </div>
        <div style={{ height: '3px', marginTop: '8px', background: 'var(--color-border)', borderRadius: '2px' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-brand)', borderRadius: '2px' }} />
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
