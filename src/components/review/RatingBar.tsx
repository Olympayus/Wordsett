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
 * 三级记忆键（v0.6.3 条目 13：改用通用方块按钮；打磨：整行也收窄，不再擑满左栏）。
 *
 * tone='surface'：本行所在的 flex 列不设底，最近一个设了底的祖先是 ReviewModule 的
 * <main>（--color-surface 纯白）。
 *
 * **不再等分擑满、也不铺开**（v0.6.3 打磨）：第一版只把每颗从 181 缩到 68，仍用
 * space-between 铺满整条 550px 的行——键变小了、行还是那么宽，看着是「三个小按钮被摊在
 * 一条很长的线上」。现在整行退成 inline-flex，三颗按内容宽并排、行本身随之变短
 * （约 3×68 + 2×8 ≈ 220px），与键入框、题面一样在左栏左侧收成一小块。
 * 上限 maxWidth 兜住空间不够的情形（窄栏、翻译要换行），届时由每颗的 minWidth 决定何时生效。
 */
export default function RatingBar({ onRate, disabled }: { onRate: (rating: number) => void; disabled?: boolean }) {
  return (
    <div
      // alignSelf: flex-start 落在包裹的 <div> 上而非本行本身——本行要退成 inline-flex
      // 才会收缩到内容宽，而 flex 容器的子项默认被 stretch 擑满。
      style={{ alignSelf: 'flex-start', maxWidth: `${RATING_BAR_MAX_WIDTH}px` }}
    >
      <div
        className="flex gap-2"
        style={{ display: 'inline-flex', flexWrap: 'wrap' }}
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
    </div>
  )
}
