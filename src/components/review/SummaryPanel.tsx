import { useEffect, useState } from 'react'
import SquareButton from '../ui/SquareButton'
import { useReviewSessionStore } from '../../stores/reviewSessionStore'
import { useReviewOverlayStore } from '../../stores/reviewOverlayStore'
import { useViewStore } from '../../stores/viewStore'
import { jumpToWord } from '../../lib/review/jumpToWord'
import { RATING_LABELS } from '../../lib/review/scopeLabel'
import { getAbsent } from '../../services/reviewService'
import {
  roundSummary, templateCounts, templateAccuracy, ratingDistribution, ratingSeries, wordLabelFor, isSkipped, correctnessLabel,
} from '../../lib/review/roundStats'

/**
 * 本轮小结（v0.6.1 §3.9 → v0.6.2 条目 18 三段式）。
 *
 * 上＝统计（答题 / 正确 / 正确率 / 跳过），中＝图表（复习首页四图的本轮变体），
 * 下＝逐题明细（单词 | 题型 | 作答 | 正误 | 记忆评分）。
 *
 * 「答错的词」清单已删——明细表的「正误」列覆盖了它。
 * 「暂无可出题内容」保留为明细表下方的链接行：它来自 getAbsent()，是「库里没进过队列
 * 的词」，不是本轮出过的题，塞不进逐题表。
 */
export default function SummaryPanel({ onRestart }: { onRestart: () => void }) {
  const { queue, answered } = useReviewSessionStore()
  const [absent, setAbsent] = useState<{ wordId: string; lemma: string }[]>([])

  useEffect(() => {
    getAbsent().then(setAbsent)
    // 小结每轮到达一次，在这里补一次叠加层取数即可：ReviewArena 已在每次评分落库后
    // 逐次重取过，这一条兜住「本轮一张都没评」或中途换了词的尾巴，让词表徽标与
    // 记忆强度 chip 在离开复习区时是当轮结束时的真值。
    void useReviewOverlayStore.getState().loadOverlay()
  }, [])

  const summary = roundSummary(queue, answered)
  const counts = templateCounts(queue)
  const accs = templateAccuracy(answered)
  const dist = ratingDistribution(answered)
  const series = ratingSeries(answered)

  return (
    <div className="flex flex-col gap-5 p-8" style={{ maxWidth: '760px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 600 }}>本轮小结</h2>

      <SectionTitle>统计</SectionTitle>
      <div style={{ display: 'flex', gap: 10 }}>
        <Stat label="答题" value={String(summary.answeredCount)} unit="张" />
        <Stat label="正确" value={String(summary.correctCount)} unit="张" />
        <Stat label="正确率" value={summary.accuracy.replace('%', '')} unit={summary.accuracy === '—' ? '' : '%'} />
        <Stat label="跳过" value={String(summary.skippedCount)} unit="张" />
      </div>

      <SectionTitle>图表</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <RoundCard title="本轮评分走势" subtitle={`按答题顺序 · 均值 ${avg(series).toFixed(1)}`}>
          <SeriesLine data={series} />
        </RoundCard>
        <RoundCard title="本轮题型构成" subtitle={counts.filter(c => c.count > 0).map(c => `${c.label} ${c.count}`).join(' · ') || '本轮没有题'}>
          <StackedBars rows={counts.filter(c => c.count > 0).map(c => ({ label: c.label, n: c.count }))} />
        </RoundCard>
        <RoundCard title="本轮评分分布" subtitle={`忘了 ${dist.again} · 模糊 ${dist.hard} · 记得 ${dist.good}`}>
          <StackedBars rows={[{ label: '忘了', n: dist.again }, { label: '模糊', n: dist.hard }, { label: '记得', n: dist.good }]} />
        </RoundCard>
        <RoundCard title="本轮题型正确率" subtitle={accuracySubtitle(accs)}>
          <AccuracyRows rows={accs} />
        </RoundCard>
      </div>

      <SectionTitle>逐题明细</SectionTitle>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['单词', '题型', '你的作答', '正误', '记忆评分'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '0 8px 6px', fontSize: '10.5px', color: 'var(--color-text-tertiary)', fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {queue.map(c => {
            const entry = answered.find(a => a.cardId === c.cardId)
            const ok = entry ? entry.rating >= 3 : null
            return (
              <tr key={c.cardId}>
                <td style={{ padding: '6px 8px', borderTop: '1px solid var(--color-surface-sunken)', fontFamily: 'var(--font-serif)', fontWeight: 600, fontSize: '12.5px' }}>
                  <button type="button" onClick={() => void jumpToWord(c.wordId)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
                    {wordLabelFor(c)}
                  </button>
                </td>
                <td style={{ padding: '6px 8px', borderTop: '1px solid var(--color-surface-sunken)', fontSize: '12px', color: 'var(--color-text-secondary)' }}>{counts.find(x => x.template === c.template)?.label ?? c.template}</td>
                <td style={{ padding: '6px 8px', borderTop: '1px solid var(--color-surface-sunken)', fontSize: '12.5px' }}>{entry ? (entry.input || (isSkipped(entry) ? '（跳过）' : '（揭示后评分）')) : '（未作答）'}</td>
                <td style={{ padding: '6px 8px', borderTop: '1px solid var(--color-surface-sunken)', fontSize: '12px', fontWeight: 600, color: ok === null ? 'var(--color-text-tertiary)' : ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  {correctnessLabel(ok)}
                </td>
                <td style={{ padding: '6px 8px', borderTop: '1px solid var(--color-surface-sunken)', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                  {entry ? RATING_LABELS[entry.rating] ?? '—' : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {absent.length > 0 && (
        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          另有 <b>{absent.length}</b> 个词条暂无可出题内容（缺释义 / 例句 / 音标）：
          {absent.map((a, i) => (
            <span key={a.wordId}>
              {i > 0 && ' · '}
              <button type="button" onClick={() => void jumpToWord(a.wordId)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', color: 'var(--color-brand)', textDecoration: 'underline' }}>
                {a.lemma}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 两个出口同形同位：v0.6.2 起复习区不再有实底主色按钮（spec §2.3），
          「回工作台」与「继续练」的先后靠位置与文案区分。所在是 flex 行，不涉及拉伸。 */}
      <div className="flex gap-2">
        <SquareButton tone="surface" onClick={onRestart}>继续练 → 自由练习</SquareButton>
        <SquareButton tone="surface" onClick={() => { useReviewSessionStore.getState().reset(); useViewStore.getState().showModule('workbench') }}>回工作台</SquareButton>
      </div>
    </div>
  )
}

/**
 * 题型正确率卡的补充文字。**没出的题型不出现**，而不是印 0%——
 * 0% 的意思是「出了但全错」（见 roundStats.templateAccuracy 的注释）。
 *
 * 判据是 `accuracy !== null` 而不是 `count > 0`：两者当前等价，但只有前者能把
 * `number | null` 收窄成 `number`，从而让下面不必再写 `?? 0` 兜底。早先那行
 * `Math.round((a.accuracy ?? 0) * 100)` 里的兜底是死的，却正好是 Review Focus 2
 * 禁掉的那个 0%——谁把两个表达式的顺序一换，「没出」就静默变成「全错」。
 */
function accuracySubtitle(accs: { label: string; accuracy: number | null }[]): string {
  const drawn = accs.filter((a): a is { label: string; accuracy: number } => a.accuracy !== null)
  if (drawn.length === 0) return '本轮没有题'
  return drawn.map(a => `${a.label} ${Math.round(a.accuracy * 100)}%`).join(' · ')
}

function avg(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{children}</div>
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 600, fontFamily: 'var(--font-serif)', marginTop: 2 }}>
        {value}{unit && <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--color-text-secondary)', marginLeft: 3 }}>{unit}</span>}
      </div>
    </div>
  )
}

function RoundCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{title}</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 46 }}>{children}</div>
      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>{subtitle}</div>
    </div>
  )
}

/**
 * 本轮评分走势：纵轴固定 1..3，横轴是作答顺序。
 *
 * W / H 是几何基准尺寸，不是渲染宽度：svg 铺满卡片（width 100%），用 viewBox 保比例，
 * 横轴随之拉伸。与 StatsMini.RatingSpark 同一处写法——写死 width={W} 会让 svg 的固有
 * 宽度变成 1fr 1fr 栅格的 min-width 下限，窗口一窄就把两列撑破、横向溢出。
 * preserveAspectRatio="none" 让折线随卡片宽度横向拉伸；配套 non-scaling-stroke 把线宽
 * 钉在 2.5px，否则横向拉伸会把线也一起拉粗。
 * 纵轴仍是 1:1：viewBox 高与渲染高都是 H，只有 x 方向被拉伸，故 1..3 的三档间距不失真。
 */
function SeriesLine({ data }: { data: number[] }) {
  if (data.length === 0) return <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>还没有作答</div>
  const W = 300, H = 46
  const step = data.length > 1 ? W / (data.length - 1) : W
  const pts = data.map((r, i) => `${i * step},${H - ((r - 1) / 2) * H}`).join(' ')
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="本轮评分走势" style={{ display: 'block' }}>
      <line x1="0" y1={H} x2={W} y2={H} stroke="var(--color-surface-sunken)" strokeWidth="1" />
      <polyline points={pts} fill="none" stroke="var(--color-brand)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/** 堆叠条：按行数占比例填色。 */
function StackedBars({ rows }: { rows: { label: string; n: number }[] }) {
  const total = rows.reduce((a, b) => a + b.n, 0)
  if (total === 0) return <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>—</div>
  const colors = ['var(--color-brand)', '#7f9bb8', '#a9bccf', '#c9d4e0', 'var(--color-border)']
  return (
    <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden' }}>
      {rows.map((r, i) => (
        <div key={r.label} title={`${r.label} ${r.n}`} style={{ width: `${(r.n / total) * 100}%`, background: colors[i % colors.length] }} />
      ))}
    </div>
  )
}

/** 题型正确率：横向条 + 百分数；未出到的题型显示「—」，不显示 0%。 */
function AccuracyRows({ rows }: { rows: { label: string; count: number; accuracy: number | null }[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {rows.map(r => (
        <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 56, fontSize: '11px', color: 'var(--color-text-secondary)' }}>{r.label}</span>
          <span style={{ flex: 1, height: 9, borderRadius: 5, background: 'var(--color-surface-sunken)', overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${r.accuracy === null ? 0 : r.accuracy * 100}%`, background: 'var(--color-brand)' }} />
          </span>
          <span style={{ width: 34, fontSize: '11px', color: 'var(--color-text-secondary)', textAlign: 'right' }}>
            {r.accuracy === null ? '—' : `${Math.round(r.accuracy * 100)}%`}
          </span>
        </div>
      ))}
    </div>
  )
}
