/**
 * 「标签＋说明」在左、数字框在右的一行（原为 ReviewSettings 的局部组件）。
 *
 * 抽出来是因为 v0.7.0 把音色与语速拆成独立的「语音」分区后，两个分区各要一份：
 * 留两处副本迟早会漂——本文件就是那唯一一份。
 *
 * items-center：输入框垂直居中于左列那两行之中（v0.6.1 §2.7）。
 * 早先输入框与第一行标签对齐、说明文字溢出到框下方，视觉重心偏上。
 */
export default function NumberRow({ label, hint, value, min, max, step, integer, onChange }: {
  label: string; hint: string; value: number; min: number; max: number; step: number
  /** 整型项：step 只是输入框提示，不拦手输，故在这里显式取整（保留率与语速是有意的小数，不传）。 */
  integer?: boolean
  onChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: '13px' }}>{label}</span>
        <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>{hint}</span>
      </div>
      <input
        type="number" value={value} min={min} max={max} step={step}
        onChange={e => {
          const v = Number(e.target.value)
          if (Number.isNaN(v)) return
          const clamped = Math.min(max, Math.max(min, v))
          onChange(integer ? Math.round(clamped) : clamped)
        }}
        style={{ width: '90px', flexShrink: 0, padding: '4px 8px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-strong)', background: 'transparent', color: 'inherit', fontSize: '13px' }}
      />
    </div>
  )
}
