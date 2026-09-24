import { useEffect, useState } from 'react'
import StatsMini, { type ReviewStats } from './StatsMini'
import { useReviewSessionStore } from '../../stores/reviewSessionStore'
import { useViewStore } from '../../stores/viewStore'
import { useWordStore } from '../../stores/wordStore'
import { getStats, getAbsent } from '../../services/reviewService'
import type { ReviewCardDTO } from '../../services/reviewService'

export default function SummaryPanel({ onRestart }: { onRestart: () => void }) {
  const { queue, answered, startedAt } = useReviewSessionStore()
  const showWorkbench = useViewStore(s => s.showWorkbench)
  const selectWord = useWordStore(s => s.selectWord)
  const [stats, setStats] = useState<ReviewStats | null>(null)
  const [absent, setAbsent] = useState<{ wordId: string; lemma: string }[]>([])

  useEffect(() => {
    getStats().then(setStats)
    getAbsent().then(setAbsent)
  }, [])

  const again = answered.filter(a => a.rating === 1).length
  const hard = answered.filter(a => a.rating === 2).length
  const good = answered.filter(a => a.rating === 3).length
  const seconds = startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0
  const wrong = queue.filter(c => answered.some(a => a.cardId === c.cardId && a.rating === 1))

  const jump = async (wordId: string) => {
    showWorkbench()
    await selectWord(wordId)
  }

  return (
    <div className="flex flex-col gap-5 p-8" style={{ maxWidth: '720px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 600 }}>本轮小结</h2>
      <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
        {answered.length} 张 · 用时 {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
      </p>
      <p style={{ fontSize: '13px' }}>
        评分分布　忘了 {again} · 模糊 {hard} · 记得 {good}
      </p>

      {stats && <StatsMini stats={stats} />}

      <Section title={`答错的词 (${wrong.length})`} empty="本轮没有答错的词">
        {wrong.map(c => (
          <Row key={c.cardId} onClick={() => jump(c.wordId)}>
            {wrongLabel(c)}
          </Row>
        ))}
      </Section>

      <Section title={`暂无可出题内容 (${absent.length})`} empty="没有缺内容的词条">
        {absent.map(a => <Row key={a.wordId} onClick={() => jump(a.wordId)}>{a.lemma}</Row>)}
      </Section>

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

/** 答错的词列表的可读标签：题面单词（认读的题面才有）→ 答案里的单词 → 答案释义 → 卡号兜底。 */
function wrongLabel(c: ReviewCardDTO): string {
  const p = c.prompt as Record<string, unknown>
  const a = c.answer as Record<string, unknown>
  const label = [p.lemma, a.lemma, a.translation]
    .map(v => (v === null || v === undefined ? '' : String(v)))
    .find(v => v !== '')
  return label ?? c.cardId
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {  const items = Array.isArray(children) ? children : [children]
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{title}</span>
      {items.length === 0 || items.every(c => c === null || c === undefined)
        ? <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{empty}</span>
        : children}
    </div>
  )
}

function Row({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ textAlign: 'left', background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer', fontSize: '13px', color: 'var(--color-text-primary)' }}>
      {children}
    </button>
  )
}
