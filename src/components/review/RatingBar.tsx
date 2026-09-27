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
 * 三级记忆键（v0.6.3 条目 13：改用通用方块按钮）。
 *
 * tone='surface'：本行所在的 flex 列不设底，最近一个设了底的祖先是 ReviewModule 的
 * <main>（--color-surface 纯白）。grow 让三颗等宽——见 SquareButton 里那个 prop 的说明。
 */
export default function RatingBar({ onRate, disabled }: { onRate: (rating: number) => void; disabled?: boolean }) {
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
        >
          {o.label} <span style={{ opacity: 0.5, fontSize: '11px' }}>{o.key}</span>
        </SquareButton>
      ))}
    </div>
  )
}
