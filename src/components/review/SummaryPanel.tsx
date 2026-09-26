import { useEffect, useState } from 'react'
import { useReviewSessionStore } from '../../stores/reviewSessionStore'
import { useViewStore } from '../../stores/viewStore'
import { jumpToWord } from '../../lib/review/jumpToWord'
import { getAbsent } from '../../services/reviewService'
import {
  roundSummary, templateCounts, templateAccuracy, ratingDistribution, ratingSeries, wordLabelFor,
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
  const { queue, answered, startedAt } = useReviewSessionStore()
  const [absent, setAbsent] = useState<{ wordId: string; lemma: string }[]>([])

  useEffect(() => {
    getAbsent().then(setAbsent)
  }, [])

  const summary = roundSummary(queue, answered)
  const counts = templateCounts(queue)
  const accs = templateAccuracy(answered)
  const dist = ratingDistribution(answered)
  const series = ratingSeries(answered)
  const seconds = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0

  return (
    <div className="flex flex-col gap-5 p-8" style={{ maxWidth: '760px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 600 }}>本轮小结</h2>
      <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
        用时 {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
      </p>

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
        <RoundCard title="本轮题型正确率" subtitle={accs.filter(a => a.count > 0).map(a => `${a.label} ${Math.round((a.accuracy ?? 0) * 100)}%`).join(' · ') || '本轮没有题'}>
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
                <td style={{ padding: '6px 8px', borderTop: '1px solid var(--color-surface-sunken)', fontSize: '12.5px' }}>{entry ? (entry.input || '（跳过）') : '（未作答）'}</td>
                <td style={{ padding: '6px 8px', borderTop: '1px solid var(--color-surface-sunken)', fontSize: '12px', fontWeight: 600, color: ok === null ? 'var(--color-text-tertiary)' : ok ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  {ok === null ? '—' : ok ? '正确' : '不正确'}
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

      <div className="flex gap-2">
        <button type="button" onClick={onRestart} style={{ padding: '8px 16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', background: 'var(--color-surface)', cursor: 'pointer', fontSize: '13px' }}>
          继续练 → 自由练习
        </button>
        <button type="button" onClick={() => { useReviewSessionStore.getState().reset(); useViewStore.getState().showModule('workbench') }} style={{ padding: '8px 16px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-brand)', color: '#fff', cursor: 'pointer', fontSize: '13px' }}>
          回工作台
        </button>
      </div>
    </div>
  )
}

/** 评分档位的中文标签（与 ReviewArena 的 RATING_LABELS 同源；4 是预留档，本期无 UI）。 */
const RATING_LABELS: Record<number, string> = { 1: '忘了', 2: '模糊', 3: '记得', 4: '轻松' }

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

/** 本轮评分走势：纵轴固定 1..3，横轴是作答顺序。 */
function SeriesLine({ data }: { data: number[] }) {
  if (data.length === 0) return <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>还没有作答</div>
  const W = 300, H = 46
  const step = data.length > 1 ? W / (data.length - 1) : W
  const pts = data.map((r, i) => `${i * step},${H - ((r - 1) / 2) * H}`).join(' ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="本轮评分走势" style={{ display: 'block', maxWidth: '100%' }}>
      <line x1="0" y1={H} x2={W} y2={H} stroke="var(--color-surface-sunken)" strokeWidth="1" />
      <polyline points={pts} fill="none" stroke="var(--color-brand)" strokeWidth="2.5" />
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
