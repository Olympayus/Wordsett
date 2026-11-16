import type { InitialFamiliarityChoice } from '../../services/wordService'
import { NAV_CONTROL_HEIGHT } from '../../lib/layout'

/**
 * 初始熟悉度三档单选（spec 4.6；出题依据 02 §5.8 / 03 §2.10）。
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

/** 分段控件的轨底内衬（v0.7.9 §5.7 点 3）。 */
const TRACK_PADDING = 2
/** 外轨圆角；内件圆角 = 外轨 − 内衬，视觉上才是同一套同心圆角。 */
const TRACK_RADIUS = 8

export default function FamiliarityChoice({ value, onChange, disabled, touch = false }: {
  value: InitialFamiliarityChoice
  onChange: (v: InitialFamiliarityChoice) => void
  disabled?: boolean
  /**
   * 触屏档（Task 8，手机词典详情底部动作条）：分段件高度取 **44px**（spec §10 的触摸下限）。
   *
   * 视觉与桌面档逐字同款（同轨底 / 同选中态 / 同墨色），只差高度与水平内边距——
   * 触屏档的内边距按比例放大（12 → 20），于是宽度与高度同向变化。
   *
   * 缺省 false：桌面 `WorkbenchNavBar` / 划词小窗的调用点逐字不变。
   */
  touch?: boolean
}) {
  return (
    <div
      role="radiogroup"
      aria-label="初始熟悉度"
      style={{
        display: 'inline-flex',
        gap: 2,
        padding: TRACK_PADDING,
        background: 'var(--color-border)',
        borderRadius: TRACK_RADIUS,
      }}
    >
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
              // 分段件（v0.7.9 §5.7 点 3）：选中项白面 + 强描边 + 600，未选中透明；
              // 文字恒主色——选中靠面与描边表达，不把未选项压成灰（那会读成禁用）。
              // 桌面档高度 = NAV_CONTROL_HEIGHT − 2 × 内衬：轨与内件合计仍是 22px，
              // 与导航条右端其余控件逐像素等高（v0.7.2 定下的几何不破）。
              // `touch` 档把内件提到 44px（触摸下限），轨随之 48px。
              height: touch ? `${FAMILIARITY_TOUCH_HEIGHT}px` : `${NAV_CONTROL_HEIGHT - TRACK_PADDING * 2}px`,
              display: 'inline-flex', alignItems: 'center',
              padding: touch ? '0 20px' : '0 12px', lineHeight: 1,
              borderRadius: TRACK_RADIUS - TRACK_PADDING,
              cursor: disabled ? 'default' : 'pointer',
              fontFamily: 'var(--font-sans)', fontSize: 12.5,
              // 非选中项用透明描边占位：选中 / 未选中只换颜色，几何完全一致，切换时不跳。
              border: `1px solid ${active ? 'var(--color-border-strong)' : 'transparent'}`,
              background: active ? 'var(--color-surface)' : 'transparent',
              color: 'var(--color-text-primary)',
              fontWeight: active ? 600 : 400,
              // 触屏：禁掉双击缩放选中与点击高亮块（与 SquareButton / MobileAppBar 同一套措施）
              ...(touch ? { touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' } : null),
            }}
          >{o.label}</button>
        )
      })}
    </div>
  )
}
