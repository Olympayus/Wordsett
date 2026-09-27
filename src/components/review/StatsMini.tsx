import { dayTotal, dayAccuracy, isTrendSparse, subtitleFor, periodFor, splitCaptionNumbers } from '../../lib/review/trend'

export interface ReviewStats {
  masteryBuckets: number[]
  dueByDay: number[]
  recentRatings: { day: string; again: number; hard: number; good: number }[]
}

/**
 * 四张卡的标题与其补充文字口径，合成一张表。
 * 早先是两个平行数组（标题一份、subtitleFor('…') 四次调用），对调任意相邻两项照样编译、
 * 过类型检查、过 lint、渲染也像模像样，只在卡面写错数字。kind 写错则更隐蔽——趋势图搬进来时
 * 就差点把 TrendBar 带着上一张卡的 kind 一起改名。标题字面取自 spec §4.2 的表，不改。
 */
const CARDS = [
  { title: '遗忘曲线变动', kind: 'rating', render: (d: ReviewStats) => <RatingSpark data={d.recentRatings} /> },
  { title: '明日压力', kind: 'due', render: (d: ReviewStats) => <DueBars data={d.dueByDay} /> },
  { title: '熟知度分布', kind: 'mastery', render: (d: ReviewStats) => <MasteryBuckets data={d.masteryBuckets} /> },
  { title: '近 14 天 · 复习量 / 正确率', kind: 'trend', render: (d: ReviewStats) => <TrendBars data={d.recentRatings} /> },
] as const

/**
 * 复习统计的四宫格（v0.6.1 三图 → v0.6.2 条目 9 四图）。
 *
 * 2×2 等宽等高——原来是三张窄卡挤一行 + 趋势单独铺满，四张大小不一、纵轴不齐。
 * 每张卡底部有一行补充文字（subtitleFor），因为小图上读不准具体数值，
 * 而 hover tooltip 在触控板上等于没有。
 */
export default function StatsMini({ stats }: { stats: ReviewStats }) {
  // 稀疏判据直接调 isTrendSparse，不在此处重抄一遍——它就是为「两处各自判一次稀疏，
  // 判出互相矛盾的结果」而抽出来的（trend.ts），抄一份等于把这个坑重新埋回去。
  // 稀疏时四张一起换成占位卡（spec §4.2）。
  const sparse = isTrendSparse(stats.recentRatings, stats.dueByDay)
  return (
    // maxWidth 624（v0.6.3 条目 9）：每张卡约 306px，而折线的 viewBox 宽是 300 且
    // preserveAspectRatio="none"，横向拉伸因此回到约 1:1。全屏时每张卡超过 500px、
    // 拉长一倍以上会失真。窗口窄于 624px 时不缩——它本来就铺不到那么宽。
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', width: '100%', maxWidth: 624 }}>
      {sparse
        ? CARDS.map(c => (
            <div key={c.kind} style={{ padding: '10px 12px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{c.title}</div>
              <div style={{ fontSize: '12px', marginTop: '6px', color: 'var(--color-text-secondary)' }}>数据积累中</div>
            </div>
          ))
        : CARDS.map(c => (
            <MiniCard key={c.kind} title={c.title} period={periodFor(c.kind)} subtitle={subtitleFor(c.kind, stats)}>{c.render(stats)}</MiniCard>
          ))}
    </div>
  )
}

function MiniCard({ title, period, subtitle, children }: {
  title: string; period: string; subtitle: string; children: React.ReactNode
}) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        {/* 标题改衬线体并略微放大（v0.6.3 条目 7：11px 无衬线 → 13px 衬线） */}
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{title}</span>
        {period && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-secondary)' }}>{period}</span>
        )}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: H }}>{children}</div>
      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', lineHeight: 1.55 }}><Caption text={subtitle} /></div>
    </div>
  )
}

/** 补充文字：数字段包 .stat-num（v0.6.3 条目 7）。切分规则在 trend.ts，本组件只消费。 */
function Caption({ text }: { text: string }) {
  return (
    <>
      {splitCaptionNumbers(text).map((p, i) =>
        p.isNum ? <span key={i} className="stat-num">{p.text}</span> : <span key={i}>{p.text}</span>,
      )}
    </>
  )
}

/**
 * 图表容器：固定 46px 高 + 底部基线 + 左右端点刻度（v0.6.3 条目 7）。
 *
 * marginBottom 16px 给刻度文字留出它自己的band——刻度绝对定位在 bottom: -14px，
 * 不占图表本体的高度，故高度仍是 46px、没有被这一项改高。
 */
function ChartFrame({ left, right, children }: { left: string; right: string; children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', height: H, marginBottom: 16 }}>
      {children}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, background: 'var(--color-border-strong)' }} />
      <span style={{ position: 'absolute', left: 0, bottom: -14, fontSize: 9.5, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{left}</span>
      <span style={{ position: 'absolute', right: 0, bottom: -14, fontSize: 9.5, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>{right}</span>
    </div>
  )
}

/**
 * 折线的几何基准尺寸，不是渲染宽度：svg 铺满卡片（width 100%），用 viewBox 保持比例，
 * 横轴随之拉伸。若写死 width={W}，grid 单元的 min-width:auto 会被 svg 的固有宽度顶开，
 * 窗口一窄就把两列撑破、横向溢出。
 */
const W = 300, H = 46

function RatingSpark({ data }: { data: ReviewStats['recentRatings'] }) {
  const max = Math.max(1, ...data.map(dayTotal))
  const step = data.length > 1 ? W / (data.length - 1) : W
  const pts = data.map((d, i) => {
    const v = (d.good + d.hard * 0.5) / max
    return `${i * step},${H - v * H}`
  }).join(' ')
  return (
    // preserveAspectRatio="none" 让折线随卡片宽度横向拉伸；配套 non-scaling-stroke
    // 把线宽钉在 1.5px——否则横向拉伸会把线也一起拉粗。纵轴是 viewBox 高原样渲染。
    <ChartFrame left={data[0]?.day ?? ''} right={data[data.length - 1]?.day ?? ''}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="none" role="img" aria-label="近期评分走势（均值满分 1）" style={{ display: 'block' }}>
        <polyline points={pts} fill="none" stroke="var(--color-brand)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </ChartFrame>
  )
}

function DueBars({ data }: { data: number[] }) {
  const max = Math.max(1, ...data)
  return (
    <ChartFrame left="今天" right="第 7 天">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '100%' }}>
        {data.map((n, i) => (
          <div key={i} title={`${i} 天后：${n} 张`} style={{ flex: 1, height: `${Math.max(2, (n / max) * H)}px`, background: 'var(--color-brand)', opacity: 0.75, borderRadius: '2px' }} />
        ))}
      </div>
    </ChartFrame>
  )
}

function MasteryBuckets({ data }: { data: number[] }) {
  const total = Math.max(1, data.reduce((a, b) => a + b, 0))
  const colors = ['var(--color-border)', '#c9d4e0', '#a9bccf', '#7f9bb8', '#5a7d9e']
  return (
    <ChartFrame left="陌生" right="熟练">
      <div style={{ display: 'flex', alignItems: 'flex-end', height: '100%' }}>
        {data.map((n, i) => <div key={i} style={{ width: `${(n / total) * 100}%`, background: colors[i] }} />)}
      </div>
    </ChartFrame>
  )
}

/** 近 14 天柱状：柱高＝当日复习量，柱色深浅＝当日正确率。与旧 OverviewPanel.TrendBar 同一判据。 */
function TrendBars({ data }: { data: ReviewStats['recentRatings'] }) {
  const max = Math.max(1, ...data.map(dayTotal))
  return (
    <ChartFrame left={data[0]?.day ?? ''} right={data[data.length - 1]?.day ?? ''}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: '100%' }}>
        {data.map(r => {
          const n = dayTotal(r)
          const acc = dayAccuracy(r)
          return (
            <div
              key={r.day}
              title={`${r.day}：${n} 张，正确率 ${Math.round(acc * 100)}%`}
              style={{ flex: 1, height: `${Math.max(3, (n / max) * H)}px`, background: 'var(--color-brand)', opacity: 0.35 + acc * 0.65, borderRadius: '2px 2px 0 0' }}
            />
          )
        })}
      </div>
    </ChartFrame>
  )
}
