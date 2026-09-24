import { useState } from 'react'

export type FreeScopeKind = 'category' | 'random' | 'today' | 'weak'

export default function FreeScopePanel({ categories, onStart }: {
  categories: { id: string; name: string }[]
  onStart: (scope: { kind: FreeScopeKind; categoryId?: string; limit: number }) => void
}) {
  const [kind, setKind] = useState<FreeScopeKind>('random')
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id ?? '')
  const [limit, setLimit] = useState(20)

  return (
    <div className="flex flex-col items-start gap-5 p-8" style={{ maxWidth: '480px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 600 }}>自由练习</h2>
      <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
        不计分、不推进调度——纯强化，随时可停
      </p>

      <fieldset className="flex flex-col gap-2" style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>范围</legend>
        {([
          ['random', '全库随机'],
          ['today', '今日队列重练'],
          ['weak', '薄弱词'],
          ['category', '某个分类'],
        ] as [FreeScopeKind, string][]).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2" style={{ fontSize: '13px' }}>
            <input type="radio" name="free-scope" checked={kind === k} onChange={() => setKind(k)} />
            {label}
          </label>
        ))}
      </fieldset>

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
  )
}
