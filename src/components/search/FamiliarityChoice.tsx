import type { InitialFamiliarityChoice } from '../../services/wordService'
import { NAV_CONTROL_HEIGHT } from '../../lib/layout'

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
              // 尺寸（v0.7.2 修复 1「初始熟悉度选择按钮过大」）：三键与导航条右端其余控件同高
              // （NAV_CONTROL_HEIGHT 22px），不再撑满整条 32px。改前只有内边距、行高随 body 的 1.7 走，
              // 实高 ≈31px——比旁边的「合并添加 · N 项」高近 10px，故用户觉得「过大」。
              // 水平内边距与行高取设计稿 .seg span（showcase-v2:83：padding:3px 12px / line-height:1.5）；
              // 行高必须显式给，否则继承 1.7 会把 22px 的内容框顶穿到内边距里。
              height: `${NAV_CONTROL_HEIGHT}px`, display: 'inline-flex', alignItems: 'center',
              padding: '3px 12px', lineHeight: 1.5, borderRadius: 'var(--radius-full)', cursor: disabled ? 'default' : 'pointer',
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
