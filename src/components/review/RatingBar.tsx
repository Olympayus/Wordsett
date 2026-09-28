import SquareButton from '../ui/SquareButton'

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

/**
 * 三级记忆键（v0.6.3 条目 13：改用通用方块按钮；打磨：等分擑满左半栏）。
 *
 * tone='surface'：本行所在的 flex 列不设底，最近一个设了底的祖先是 ReviewModule 的
 * <main>（--color-surface 纯白）。
 *
 * **等分擑满整条左半栏**（v0.6.3 打磨终稿，用户在三版里选的）：左半栏里题面文字与 2×2
 * 选项本来就填满 550，底部只有这一行和键入框没填满。擑满的意义是**对齐**——三键与键入框、
 * 与上方选项共用同一条右边界，一列控件一列控件地扫下去，右侧是一条笔直的线。
 *
 * 走过两版：① 每颗按内容宽 68 + space-between 铺满整行（键小了、行还是 550，看着像
 * 「三个小按钮摊在一条很长的线上」）；② 整行退成 inline-flex 收成 ~220px 的一小簇。
 * 两者都只解决「键太宽」，没解决「行与上方不对齐」。擑满是唯一让四行控件同右边界的做法。
 *
 * 宽度不写死：grow 让三颗按 `1fr` 对分，父列的 maxWidth（resultLayout 的
 * RESULT_HALF_WIDTH）给上限，于是窄栏时三颗会随栏一起收窄，不会顶出左半栏。
 */
export default function RatingBar({ onRate, disabled, defaultRating }: {
  onRate: (rating: number) => void
  disabled?: boolean
  /** 首评的视觉默认键（spec 4.6）。null = 不预填。**不抢 DOM 焦点** */
  defaultRating?: 1 | 2 | 3 | null
}) {
  return (
    <div className="flex gap-2" role="group" aria-label="评分">
      {RATING_OPTIONS.map(o => (
        <SquareButton
          key={o.rating}
          tone="surface"
          grow
          disabled={disabled}
          onClick={() => onRate(o.rating)}
          aria-keyshortcuts={o.key}
          highlight={o.rating === defaultRating}
        >
          {o.label} <span style={{ opacity: 0.5, fontSize: '11px' }}>{o.key}</span>
        </SquareButton>
      ))}
    </div>
  )
}
