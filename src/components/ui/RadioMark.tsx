/**
 * 单选圆点（v0.7.9）：13px 圆环 + 选中时品牌色内点。
 *
 * 划词小窗的「整句归入哪个释义」与主窗详情页的「划词例句」条共用这一枚——
 * 两处表达同一件事（选一条释义作父级），圆点的画法不能各写一份。
 */
export default function RadioMark({ active }: { active: boolean }) {
  return (
    <span style={{
      width: '13px', height: '13px', flexShrink: 0, position: 'relative',
      borderRadius: 'var(--radius-full)', border: '1.5px solid var(--color-border-strong)',
      ...(active ? { borderColor: 'var(--color-brand)', background: 'var(--color-surface)' } : null),
    }}>
      {active && (
        <span style={{
          position: 'absolute', inset: '2.5px',
          borderRadius: 'var(--radius-full)', background: 'var(--color-brand)',
        }} />
      )}
    </span>
  )
}
