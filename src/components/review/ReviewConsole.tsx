import { accuracyText } from '../../lib/review/scopeLabel'

/**
 * 左栏顶部小控制台（v0.6.1 §3.1，v0.6.2 §4.1 扩容，v0.6.3 条目 1、2 重排）。
 *
 * 两态：空闲态报全局量（今日待复习 / 新词 / 薄弱词），做题态报范围 / 题型 / 做题进度 / 正确率。
 * 边界：只放计数、进度与范畴名——零词条内容，不放 lemma（v0.6 spec §2.2）。
 *
 * v0.6.2 的关键约定（本版保留）：做题态那个数字是**做题进度**（已答数），不是光标位置。
 * 顶部导航栏的「第 n / N 题」才是光标位置，两者刻意分开——用箭头翻看旧题时进度不该变。
 *
 * v0.6.3：两态所有数字一律套 .stat-num（统计数字的唯一格式，src/index.css）。
 * 空闲态「今日」移到右上角，让出的左上角由「n 张待复习」上提填补，整个控制台因此矮一行。
 *
 * 本组件是纯渲染：文案与格式没有可抽的判定规则，故无单测，由肉眼验收覆盖。
 */
export interface ConsoleSession {
  total: number
  answeredCount: number
  correctCount: number
  scopeLabel: string
  /** 当前卡的题型中文名，取自 scopeLabel 的 TEMPLATE_LABEL（全仓唯一一份）。 */
  templateLabel: string
}

export default function ReviewConsole({ overview, weakCount, session }: {
  overview: { total: number; newCount: number } | null
  weakCount: number
  session: ConsoleSession | null
}) {
  if (session) {
    const { total, answeredCount, correctCount, scopeLabel, templateLabel } = session
    const pct = total > 0 ? (answeredCount / total) * 100 : 0
    return (
      <div style={{ border: '1px solid var(--color-border)', background: 'var(--color-brand-softer)', borderRadius: 'var(--radius-lg)', padding: '9px 10px', marginBottom: '8px' }}>
        {/* 范围 / 题型：同一版式两行——标签左、值右；范围值走衬线体（条目 2） */}
        <div style={{ display: 'flex', gap: 8, fontSize: '10px', color: 'var(--color-text-secondary)' }}>
          <span>范围</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-serif)', fontSize: '11.5px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{scopeLabel}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '3px' }}>
          <span>题型</span>
          <span style={{ marginLeft: 'auto', color: 'var(--color-text-primary)' }}>{templateLabel}</span>
        </div>
        <div style={{ fontSize: '16px', fontWeight: 600, marginTop: '8px' }}>
          已答 <span className="stat-num">{answeredCount}</span>{' '}
          {/* 分母也套 .stat-num（v0.6.3 评审 F3）：它是同一个数的另一半，
              留在外面会让「已答 8 / 17」里两个数字两种字形——本组件的约定是两态所有数字一律套。 */}
          <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--color-text-secondary)' }}>
            / <span className="stat-num">{total}</span>
          </span>
        </div>
        <div style={{ height: '3px', marginTop: '8px', background: 'var(--color-border)', borderRadius: '2px' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--color-brand)', borderRadius: '2px' }} />
        </div>
        <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
          正确数: <span className="stat-num">{correctCount}</span>　正确率: <span className="stat-num">{accuracyText(answeredCount, correctCount)}</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', border: '1px solid var(--color-border)', background: 'var(--color-surface-raised)', borderRadius: 'var(--radius-lg)', padding: '9px 10px', marginBottom: '8px' }}>
      {/* 「今日」右上角：衬线 + 最深的暖棕 + 加粗放大（v0.6.3 条目 1）。
          绝对定位而非 flex 右对齐——它不该占据下面数字的行序。 */}
      <div style={{
        position: 'absolute', top: 8, right: 10,
        fontFamily: 'var(--font-serif)', fontSize: '15px', fontWeight: 700,
        color: 'var(--color-warm-deep)', lineHeight: 1.25,
      }}>今日</div>
      {/* 「n 张待复习」上提到与「今日」同一行，填补它让出的左上角 */}
      <div style={{ fontSize: '16px', fontWeight: 600 }}>
        <span className="stat-num">{overview?.total ?? 0}</span>{' '}
        <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--color-text-secondary)' }}>张待复习</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: '5px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
        <span>新词: <span className="stat-num">{overview?.newCount ?? 0}</span></span>
        <span>薄弱词: <span className="stat-num">{weakCount}</span></span>
      </div>
    </div>
  )
}
