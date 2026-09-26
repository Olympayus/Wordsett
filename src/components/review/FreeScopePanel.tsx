import { useEffect, useState } from 'react'
import FreeScopeTabs from './FreeScopeTabs'
import Tooltip from '../ui/Tooltip'
import Icon from '../icons'
import { getWeakWords, getDueWordIds, REVIEW_DEFAULTS, type ReviewParams } from '../../services/reviewService'
import { getWordCategoryMap } from '../../services/categoryService'
import { aggregateCategoryCounts, canStartFreeScope } from '../../lib/review/categoryCounts'
import type { FreeScopeKind } from '../../lib/review/types'
import { jumpToWord } from '../../lib/review/jumpToWord'
import { useSettingsStore } from '../../stores/settingsStore'

export type { FreeScopeKind } from '../../lib/review/types'

export default function FreeScopePanel({ categories, onStart }: {
  categories: { id: string; name: string }[]
  onStart: (scope: { kind: FreeScopeKind; categoryIds?: string[]; limit: number }) => void
}) {
  const reviewSettings = useSettingsStore(s => s.review)
  const params: ReviewParams = { ...REVIEW_DEFAULTS, ...reviewSettings }
  const [kind, setKind] = useState<FreeScopeKind>('random')
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [rows, setRows] = useState<{ id: string; name: string; wordCount: number; dueCount: number }[]>([])
  const [limit, setLimit] = useState(20)
  const [weak, setWeak] = useState<Awaited<ReturnType<typeof getWeakWords>>>([])

  // 薄弱词列表按当前阈值实时取；只在切到该页时拉
  useEffect(() => {
    if (kind !== 'weak') return
    let alive = true
    getWeakWords(params).then(rows => { if (alive) setWeak(rows) })
    return () => { alive = false }
  }, [kind, params.leechThreshold])

  // 分类强化的行信息：词数与待复习数（v0.6.2 条目 10）。只在切到该页时拉。
  //
  // 依赖数组刻意不用 `categories` 本身：它在 ReviewModule 里是 `categories.map(...)`
  // 现造的数组，每次渲染都是新身份，直接进依赖会让这个 effect 每渲染都重跑一遍。
  // 用 id 拼成的字符串做稳定 key。
  const categoryKey = categories.map(c => c.id).join('|')
  useEffect(() => {
    if (kind !== 'category') return
    let alive = true
    void (async () => {
      const [wordCategoryMap, dueWordIds] = await Promise.all([
        getWordCategoryMap(),
        getDueWordIds(params),
      ])
      if (alive) setRows(aggregateCategoryCounts(categories, wordCategoryMap, dueWordIds))
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- categories 的身份不稳定，用 categoryKey 代
  }, [kind, categoryKey, params.leechThreshold])

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
          <div style={{ width: '100%' }}>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: 8 }}>
              勾选要出题的分类，可多选
            </div>
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              {rows.map(r => {
                // 待复习 0 的分类置灰且不可勾选——它贡献不了候选，勾上只会让
                // 「预计可出」与「开始练习」的结果对不上（Review Focus 3）。
                const disabled = r.dueCount === 0
                const on = categoryIds.includes(r.id)
                return (
                  <label
                    key={r.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '8px 12px', borderBottom: '1px solid var(--color-surface-sunken)',
                      cursor: disabled ? 'default' : 'pointer',
                      opacity: disabled ? 0.5 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={disabled}
                      onChange={() => setCategoryIds(prev => on ? prev.filter(x => x !== r.id) : [...prev, r.id])}
                    />
                    <span style={{ fontWeight: 600, fontSize: 13, fontFamily: 'var(--font-serif)', minWidth: 96 }}>{r.name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                      {r.wordCount} 词 · 待复习 {r.dueCount}
                    </span>
                  </label>
                )
              })}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-secondary)' }}>
              共选 {categoryIds.length} 个分类 · 预计可出 {rows.filter(r => categoryIds.includes(r.id)).reduce((n, r) => n + r.dueCount, 0)} 题
            </div>
          </div>
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
          // 判据抽在 canStartFreeScope 里（Review Focus 3），组件只消费结果
          disabled={!canStartFreeScope(kind, categoryIds)}
          onClick={() => onStart({
            kind,
            categoryIds: kind === 'category' ? categoryIds : undefined,
            limit,
          })}
          style={{ padding: '8px 20px', borderRadius: 'var(--radius-lg)', border: 'none', background: 'var(--color-brand)', color: '#fff', cursor: 'pointer', fontSize: '13px', opacity: canStartFreeScope(kind, categoryIds) ? 1 : 0.5 }}
        >
          开始练习
        </button>
      </div>
    </div>
  )
}
