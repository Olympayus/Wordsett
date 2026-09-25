import { useEffect, useState } from 'react'
import FreeScopeTabs from './FreeScopeTabs'
import Tooltip from '../ui/Tooltip'
import Icon from '../icons'
import { getWeakWords, REVIEW_DEFAULTS, type ReviewParams } from '../../services/reviewService'
import type { FreeScopeKind } from '../../lib/review/types'
import { jumpToWord } from '../../lib/review/jumpToWord'
import { useSettingsStore } from '../../stores/settingsStore'

export type { FreeScopeKind } from '../../lib/review/types'

export default function FreeScopePanel({ categories, onStart }: {
  categories: { id: string; name: string }[]
  onStart: (scope: { kind: FreeScopeKind; categoryId?: string; limit: number }) => void
}) {
  const reviewSettings = useSettingsStore(s => s.review)
  const params: ReviewParams = { ...REVIEW_DEFAULTS, ...reviewSettings }
  const [kind, setKind] = useState<FreeScopeKind>('random')
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id ?? '')
  const [limit, setLimit] = useState(20)
  const [weak, setWeak] = useState<Awaited<ReturnType<typeof getWeakWords>>>([])

  // 薄弱词列表按当前阈值实时取；只在切到该页时拉
  useEffect(() => {
    if (kind !== 'weak') return
    let alive = true
    getWeakWords(params).then(rows => { if (alive) setWeak(rows) })
    return () => { alive = false }
  }, [kind, params.leechThreshold])

  return (
    <div className="flex flex-col" style={{ minHeight: '100%' }}>
      <FreeScopeTabs active={kind} onSelect={setKind} />

      <div className="flex flex-col items-start gap-5 p-8" style={{ maxWidth: '620px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ fontSize: '20px', fontWeight: 600, fontFamily: 'var(--font-serif)' }}>自由练习</h2>
          <Tooltip content="自由练习不计分，不影响各单词的掌握程度">
            <span style={{ display: 'inline-flex', color: 'var(--color-text-tertiary)', cursor: 'default' }}>
              <Icon name="info" size={14} />
            </span>
          </Tooltip>
        </div>

        {kind === 'weak' && (
          weak.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
              暂无薄弱词<br />
              连错达到阈值，或近 7 天答错的词会出现在这里。阈值在设置 → 复习里调。
            </div>
          ) : (
            <div style={{ width: '100%' }}>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: 8 }}>
                连错 ≥ {params.leechThreshold} 次，或近 7 天答错过的词 · 共 {weak.length} 个
              </div>
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                {weak.map(w => (
                  <button
                    key={w.wordId}
                    type="button"
                    onClick={() => void jumpToWord(w.wordId)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                      padding: '8px 12px', border: 'none', borderBottom: '1px solid var(--color-surface-sunken)',
                      background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 13, fontFamily: 'var(--font-serif)', minWidth: 96 }}>{w.lemma}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {w.translation.split('\n')[0]}
                    </span>
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--color-accent-soft)', color: 'color-mix(in srgb, var(--color-accent) 70%, black)' }}>
                      {w.lapses > 0 ? `连错 ${w.lapses} 次` : `近 7 天答错 ${w.recentMisses} 次`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )
        )}

        {kind === 'category' && (
          <label className="flex items-center gap-2" style={{ fontSize: '13px' }}>
            分类
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              style={{ padding: '4px 8px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', background: 'transparent', color: 'inherit', fontSize: '13px' }}
            >
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}

        <label className="flex items-center gap-2" style={{ fontSize: '13px' }}>
          数量
          <input
            type="number" min={1} max={100} value={limit}
            onChange={e => setLimit(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
            style={{ width: '80px', padding: '4px 8px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', background: 'transparent', color: 'inherit', fontSize: '13px' }}
          />
        </label>

        <button
          type="button"
          disabled={kind === 'category' && !categoryId}
          onClick={() => onStart({ kind, categoryId: kind === 'category' ? categoryId : undefined, limit })}
          style={{ padding: '8px 20px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-brand)', color: '#fff', cursor: 'pointer', fontSize: '13px' }}
        >
          开始练习
        </button>
      </div>
    </div>
  )
}
