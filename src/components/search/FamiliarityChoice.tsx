import type { InitialFamiliarityChoice } from '../../services/wordService'

/**
 * 初始熟悉度三段单选（spec 4.6；出题依据 02 §5.8 / 03 §2.10）。
 *
 * 只在**词不在库**时出现——已在库的词，熟悉度只对未首评新卡有消费方，
 * 而新卡在反复收录时不会重造，再问一次是打扰。
 *
 * 默认「陌生」：不选也是一种回答，且是最保守的那个（§3.7「不自动首评」同源取向）。
 */
/** 三档枚举 → 文案。导出供测试与调用点核对——改名只动这里，库里存的是数字 1/2/3。 */
export const FAMILIARITY_OPTIONS: { value: InitialFamiliarityChoice; label: string }[] = [
  { value: 1, label: '陌生' },
  { value: 2, label: '眼熟' },
  { value: 3, label: '认识' },
]

export default function FamiliarityChoice({ value, onChange, disabled }: {
  value: InitialFamiliarityChoice
  onChange: (v: InitialFamiliarityChoice) => void
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label="初始熟悉度" style={{ display: 'inline-flex', gap: 6 }}>
      {FAMILIARITY_OPTIONS.map(o => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            style={{
              padding: '4px 13px', borderRadius: 'var(--radius-full)', cursor: disabled ? 'default' : 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: '12.5px',
              border: `1px solid ${active ? 'var(--color-brand)' : 'var(--color-border)'}`,
              background: active ? 'var(--color-brand-soft)' : 'var(--color-surface)',
              color: active ? 'var(--color-brand)' : 'var(--color-text-secondary)',
            }}
          >{o.label}</button>
        )
      })}
    </div>
  )
}
