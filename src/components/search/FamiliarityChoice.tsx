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

/**
 * 触屏档的三键高度（Task 8）：**44** —— spec §10 的触摸目标下限。
 *
 * 与 `NAV_TOUCH_CONTROL_HEIGHT`（32，`SquareButton size="touch"`）刻意不同值：那一档是
 * 「沿用 `size="nav"` 配方、把高度调到约 32dp」给**条内紧凑控件**用的，而三键是手机上
 * 少见的**大片独粒按钮**，按 §10 的 ≥44dp 走。两档各有出处，不合并。
 */
export const FAMILIARITY_TOUCH_HEIGHT = 44

export default function FamiliarityChoice({ value, onChange, disabled, touch = false }: {
  value: InitialFamiliarityChoice
  onChange: (v: InitialFamiliarityChoice) => void
  disabled?: boolean
  /**
   * 触屏档（Task 8，手机词典详情底部动作条）：把三键提到 **44px** 高。
   *
   * spec §10 要求手机上的可点目标 ≥ 44dp，而桌面档的 22px 是按「与导航条右端其余控件
   * 逐像素等高」定的（见下方 height 注释）。两态**共用同一套视觉**（同边框 / 同底色 /
   * 同字色），只差高度与水平内边距——触屏档的内边距按比例放大（12 → 20），
   * 于是三键并排的宽度与高度同向变化，不会在两种形态下读成两种控件。
   *
   * 缺省 false：桌面 `WorkbenchNavBar` 的调用点逐字不变。
   */
  touch?: boolean
}) {
  return (
    <div role="radiogroup" aria-label="初始熟悉度" style={{ display: 'inline-flex', gap: touch ? 8 : 6 }}>
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
              // `touch` 档（Task 8）只覆盖高度与水平内边距（44 / 20），其余逐字不动。
              height: touch ? `${FAMILIARITY_TOUCH_HEIGHT}px` : `${NAV_CONTROL_HEIGHT}px`,
              display: 'inline-flex', alignItems: 'center',
              padding: touch ? '0 20px' : '3px 12px', lineHeight: 1.5, borderRadius: 'var(--radius-full)', cursor: disabled ? 'default' : 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: 12.5,
              border: `1px solid ${active ? 'var(--color-brand)' : 'var(--color-border)'}`,
              background: active ? 'var(--color-brand-soft)' : 'var(--color-surface)',
              color: active ? 'var(--color-brand)' : 'var(--color-text-secondary)',
              // 触屏：禁掉双击缩放选中与点击高亮块（与 SquareButton / MobileAppBar 同一套措施）
              ...(touch ? { touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' } : null),
            }}
          >{o.label}</button>
        )
      })}
    </div>
  )
}
