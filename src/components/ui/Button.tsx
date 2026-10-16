interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
}
// 主按钮不再是品牌蓝实底（v0.7.2 §6 规则 2：蓝不做按钮底色）：改用中性配方——
// 浅暖灰底 + 1px 深描边（沿用 SquareButton 的 BUTTON_BASE 配方，两者现在同一语言）。
// 可点性靠位置与文案，不靠色相。secondary 是同一配方去描边的平版。
export function Button({ variant = 'primary', className = '', ...props }: Props) {
  const base = 'px-4 py-1.5 rounded text-sm font-medium'
  const primary = variant === 'primary'
  return (
    <button
      className={`${base} ${className}`}
      style={{
        background: 'var(--color-border)',
        color: 'var(--color-text-primary)',
        border: primary ? '1px solid var(--color-hairline)' : 'none',
        transition: `background-color var(--duration-fast) var(--ease-smooth)`,
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)',
        fontSize: '14px',
        padding: '6px 20px',
        borderRadius: '6px',
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
      }}
      {...props}
    />
  )
}
