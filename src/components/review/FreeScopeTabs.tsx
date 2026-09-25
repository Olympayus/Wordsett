import type { FreeScopeKind } from '../../lib/review/types'

export const SCOPE_TABS: { key: FreeScopeKind; label: string }[] = [
  { key: 'random', label: '全库随机' },
  { key: 'today', label: '今日队列重练' },
  { key: 'weak', label: '薄弱词专项' },
  { key: 'category', label: '某个分类' },
]

/**
 * 自由练习的范围标签页（v0.6.1 §3.3）。
 *
 * 只借 word/TabBar.tsx 的凸起标签视觉——**不带**它的「＋ 添加标签页」下拉与右键删除菜单：
 * 自由练习的范围是固定四种，没有增删的语义。
 *
 * 色值已全部换成色板 token（四个 hex 与 tokens.css 逐字节相同，渲染结果不变）。
 * word/TabBar.tsx 里的同四个值仍是硬编码——那是它自己的既有代码，本次不动。
 */
export default function FreeScopeTabs({ active, onSelect }: {
  active: FreeScopeKind
  onSelect: (k: FreeScopeKind) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, padding: '4px 24px 0', background: 'var(--color-canvas)', borderBottom: '2px solid var(--color-border-strong)' }}>
      {SCOPE_TABS.map(t => {
        const on = t.key === active
        return (
          <button
            key={t.key}
            type="button"
            aria-current={on ? 'true' : undefined}
            onClick={() => onSelect(t.key)}
            onMouseEnter={e => { if (!on) { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-brand)' } }}
            onMouseLeave={e => { if (!on) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)' } }}
            style={{
              position: 'relative', padding: '7px 20px', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
              borderRadius: '8px 8px 0 0', zIndex: 1, border: 'none', fontFamily: 'var(--font-sans)',
              background: on ? 'var(--color-surface)' : 'transparent',
              color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              fontWeight: on ? 600 : 400,
              ...(on ? { border: '1px solid var(--color-border)', borderBottom: 'none', marginBottom: -2 } : {}),
            }}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
