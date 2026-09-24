const TIER_COLORS = ['var(--color-border)', '#c9d4e0', '#a9bccf', '#7f9bb8', '#5a7d9e']

/**
 * 掌握度分布条（spec §2.1 左栏底 / §2.3 概览卡共用）：5 档聚合计数，
 * **不含任何词条内容**——左栏的零内容规则（spec §2.2）仍然成立。全为 0 时不渲染。
 */
export default function MasteryBar({ buckets }: { buckets: number[] }) {
  const total = buckets.reduce((a, b) => a + b, 0)
  if (total === 0) return null
  return (
    <div className="flex flex-col gap-1" style={{ width: '100%', maxWidth: '420px' }}>
      <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>掌握度分布</span>
      <div className="flex" style={{ height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
        {buckets.map((n, i) => (
          <div key={i} style={{ width: `${(n / total) * 100}%`, background: TIER_COLORS[i] }} />
        ))}
      </div>
    </div>
  )
}
