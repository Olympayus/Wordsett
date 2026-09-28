import SquareButton from '../ui/SquareButton'
import { RESULT_HALF_WIDTH } from '../../lib/review/resultLayout'

export interface RatingOption {
  rating: number
  label: string
  key: string
}

export const RATING_OPTIONS: RatingOption[] = [
  { rating: 1, label: '忘了', key: '1' },
  { rating: 2, label: '模糊', key: '2' },
  { rating: 3, label: '记得', key: '3' },
]

/** 三键行的宽度上限（px）＝ 结果区左栏上限（半栏 550）。取自 resultLayout，不另写一个字面量：
 *  改那一处宽度上限时三键会跟着动，否则三键与左栏各有一个上限。 */
const RATING_BAR_MAX_WIDTH = RESULT_HALF_WIDTH

/** 单键的最小宽（px）：两字标签 + 快捷键数字 + 横向内边距（12×2）+ 间隙 5，再留一点余量。
 *  低于它标签会开始换行、按钮长高，三颗就不在一行了。 */
const RATING_KEY_MIN_WIDTH = 68

/**
 * 三级记忆键（v0.6.3 条目 13：改用通用方块按钮；打磨：收窄，不再擑满整条左栏）。
 *
 * tone='surface'：本行所在的 flex 列不设底，最近一个设了底的祖先是 ReviewModule 的
 * <main>（--color-surface 纯白）。
 *
 * **不再等分擑满**（v0.6.3 打磨）：原先三颗 grow 等分，各占整条左栏的 1/3（约 181px），
 * 而三个双字标签实际只占四五十像素。现在每颗 minWidth 68 起、随内容长，间隙用
 * `justify-content: space-between` 铺开到整行——「整行被三个键占着」这个读法保留，
 * 只是每颗窄了 60%。这比「每颗都退成内容宽、整行缩成一小簇偏左」更贴原有的样子。
 * space-between 遇到放不下时不加注释、也不换行：多出来的空间从键之间的间隙里扣，
 * 间隙不够时键被挤到 minWidth 之下仍各自按内容撑开（flex-shrink: 0，见 BUTTON_BASE），
 * 三颗保持一行，代价是可能顶出行宽——右栏始终有一份 minWidth: 0 的弹性轨，不会顶破网格。
 */
export default function RatingBar({ onRate, disabled }: { onRate: (rating: number) => void; disabled?: boolean }) {
  return (
    <div
      className="flex gap-2"
      style={{ justifyContent: 'space-between', maxWidth: `${RATING_BAR_MAX_WIDTH}px` }}
      role="group"
      aria-label="评分"
    >
      {RATING_OPTIONS.map(o => (
        <SquareButton
          key={o.rating}
          tone="surface"
          minWidth={RATING_KEY_MIN_WIDTH}
          disabled={disabled}
          onClick={() => onRate(o.rating)}
          aria-keyshortcuts={o.key}
        >
          {o.label} <span style={{ opacity: 0.5, fontSize: '11px' }}>{o.key}</span>
        </SquareButton>
      ))}
    </div>
  )
}
