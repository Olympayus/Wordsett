import { useSettingsStore, type ThemeMode } from '../../stores/settingsStore'

const OPTIONS: { value: ThemeMode; label: string; hint: string }[] = [
  { value: 'system', label: '跟随系统', hint: '' },
  { value: 'light', label: '浅色', hint: '' },
  { value: 'dark', label: '深色', hint: '' },
]

/** 外观（v0.7.3）：三档单选。形态照 SidebarSettings 的 radio 卡片（同一套选中配方）。 */
export default function AppearanceSettings() {
  const theme = useSettingsStore(s => s.theme)
  const setTheme = useSettingsStore(s => s.setTheme)
  return (
    <div>
      <div role="radiogroup" aria-label="外观" style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        {OPTIONS.map(o => {
          const on = o.value === theme
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setTheme(o.value)}
              style={{
                flex: 1, textAlign: 'left', cursor: 'pointer',
                padding: '10px 12px', borderRadius: 'var(--radius-lg)',
                border: `2px solid ${on ? 'color-mix(in srgb, var(--color-brand) 35%, white)' : 'var(--color-border-strong)'}`,
                background: on ? 'var(--color-brand-soft)' : 'var(--color-surface-sunken)',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
                transition: 'background-color var(--duration-fast) var(--ease-smooth), border-color var(--duration-fast) var(--ease-smooth)',
              }}
            >
              <span style={{ display: 'block', fontWeight: on ? 'var(--weight-semibold)' : 'var(--weight-regular)' }}>{o.label}</span>
              {o.hint && (
                <span style={{ display: 'block', marginTop: 2, fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{o.hint}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
