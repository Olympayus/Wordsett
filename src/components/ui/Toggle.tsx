import HitArea, { useMobileShellHitArea } from './HitArea'

export function Toggle({ checked, onChange, disabled, ...rest }: {
  checked: boolean
  onChange: (on: boolean) => void
  disabled?: boolean
  'aria-label'?: string
}) {
  // 手机外壳才扩命中区（规格 §7.4）：视觉尺寸 36×20 不变，只加 44×44 绝对定位覆盖层。
  // 平板不扩（touch 在平板也为真，故判据取 usesMobileShell）。
  const showHitArea = useMobileShellHitArea()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => { if (!disabled) onChange(!checked) }}
      {...rest}
      style={{
        width: '36px', height: '20px', flexShrink: 0,
        borderRadius: 'var(--radius-full)',
        background: disabled ? 'var(--color-border)' : (checked ? 'var(--color-brand)' : 'var(--color-border-strong)'),
        position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer', border: 'none', padding: 0,
        opacity: disabled ? 0.55 : 1,
        transition: 'background-color var(--duration-fast) var(--ease-smooth)',
      }}
    >
      <span style={{
        position: 'absolute', top: '2px', left: '2px', width: '16px', height: '16px',
        background: 'white', borderRadius: '50%',
        transform: checked && !disabled ? 'translateX(16px)' : 'translateX(0)',
        transition: 'transform var(--duration-fast) var(--ease-smooth)',
      }} />
      <HitArea show={showHitArea} />
    </button>
  )
}
