import { accuracyText } from '../../lib/review/scopeLabel'
import { consoleLines } from '../../lib/reviewConsoleLines'

/**
 * 左栏顶部小控制台（v0.6.1 §3.1，v0.6.2 §4.1 扩容，v0.6.3 条目 1、2 重排）。
 *
 * 两态：空闲态报全局量（今日待复习 / 新词 / 薄弱词），做题态报范围 / 题型 / 做题进度 / 记得率。
 * 空闲态那两个数**不同源**（v0.6.3 打磨）：「n 张待复习」是到期积压量（getOverview().total，
 * 掩码层到期集），可以大于一轮的题数——单轮上限由设置的「队列上限」管；
 * 「新词: n」是本轮队列里实际会引入的新词数。同一个数在标题栏 chip 上也印一次，两处同源。
 * 边界：只放计数、进度与范畴名——零词条内容，不放 lemma（v0.6 spec §2.2）。
 *
 * v0.6.2 的关键约定（本版保留）：做题态那个数字是**做题进度**（已答数），不是光标位置。
 * 顶部导航栏的「第 n / N 题」才是光标位置，两者刻意分开——用箭头翻看旧题时进度不该变。
 *
 * v0.6.3：两态所有数字一律套 .stat-num（统计数字的唯一格式，src/index.css）。
 * 空闲态「今日」移到右上角，让出的左上角由「n 张待复习」上提填补，整个控制台因此矮一行。
 *
 * v0.7.3 尾段 §5：空闲态改四行（待复习 / 覆盖 / 本轮可出 / 新词·薄弱词），文案与数字
 * 全部收进纯函数 consoleLines（src/lib/reviewConsoleLines.ts，带单测），本组件只做分段渲染。
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
  overview: { total: number; newCount: number; deliverable: number; dueWordCount: number } | null
  weakCount: number
  session: ConsoleSession | null
}) {
  if (session) {
    const { total, answeredCount, correctCount, scopeLabel, templateLabel } = session
    const pct = total > 0 ? (answeredCount / total) * 100 : 0
    return (
      <div style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface-raised)', borderRadius: 'var(--radius-lg)', padding: '9px 10px', marginBottom: '8px' }}>
        {/* 会话进行中：底改中性（v0.7.2），不再铺品牌蓝底——这一块是读数不是主色区。
            边框早就有一道 1px --color-border，故只换背景，不另加线（否则重复）。 */}
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
        {/* v0.7.2：这一块是数据层的 rating 口径（rating ≥ 3 的占比），量的是记忆程度，
            不是客观正误，故指标名从「正确率」改为「记得率」（结算页的「正确率」才是客观正误）。 */}
        <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--color-text-secondary)' }}>
          记得率: <span className="stat-num">{accuracyText(answeredCount, correctCount)}</span>
        </div>
      </div>
    )
  }

  // 四行是四个不同的量（v0.7.3 尾段 §5）：到期积压按**卡**、覆盖按**词**、可出按**本轮题数**、
  // 新词与薄弱词是两个同源的词数。一行一个量，量纲不同并排会被读成分母分子。
  // 文案与数字全在纯函数 consoleLines 里（带单测），本组件只负责分段套 .stat-num。
  // 四行都无条件渲染——薄弱词为 0 时那一句照样在（行尾操作簇同款不变量）。
  const lines = consoleLines(
    {
      total: overview?.total ?? 0,
      dueWordCount: overview?.dueWordCount ?? 0,
      deliverable: overview?.deliverable ?? 0,
      newCount: overview?.newCount ?? 0,
    },
    weakCount,
  )
  return (
    <div style={{ position: 'relative', border: '1px solid var(--color-border)', background: 'var(--color-surface-raised)', borderRadius: 'var(--radius-lg)', padding: '9px 10px', marginBottom: '8px' }}>
      {/* 「今日」右上角：衬线 + 最深的暖棕 + 加粗放大（v0.6.3 条目 1）。
          绝对定位而非 flex 右对齐——它不该占据下面数字的行序。 */}
      <div style={{
        position: 'absolute', top: 8, right: 10,
        fontFamily: 'var(--font-serif)', fontSize: '15px', fontWeight: 700,
        color: 'var(--color-warm-deep)', lineHeight: 1.25,
      }}>今日</div>
      <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink-1)' }} title="到期积压不受「新词额度」与「队列上限」影响">
        {lines[0].map((seg, i) => seg.kind === 'num'
          ? <span key={i} className="stat-num">{seg.text}</span>
          : <span key={i}>{seg.text}</span>)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: '5px', fontSize: '11px', color: 'var(--ink-2)' }}>
        {lines.slice(1).map((line, li) => (
          <span key={li}>
            {line.map((seg, i) => seg.kind === 'num'
              ? <span key={i} className="stat-num">{seg.text}</span>
              : <span key={i}>{seg.text}</span>)}
          </span>
        ))}
      </div>
    </div>
  )
}
