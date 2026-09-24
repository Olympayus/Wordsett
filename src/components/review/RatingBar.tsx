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

export default function RatingBar({ onRate, disabled }: { onRate: (rating: number) => void; disabled?: boolean }) {
  return (
    <div className="flex gap-2" role="group" aria-label="评分">
      {RATING_OPTIONS.map(o => (
        <button
          key={o.rating}
          type="button"
          disabled={disabled}
          onClick={() => onRate(o.rating)}
          aria-keyshortcuts={o.key}
          style={{
            flex: 1, padding: '8px 12px', borderRadius: 'var(--radius-lg)', cursor: disabled ? 'default' : 'pointer',
            border: '1px solid var(--color-border)', background: 'var(--color-surface)',
            color: 'var(--color-text-primary)', fontSize: '13px', opacity: disabled ? 0.5 : 1,
          }}
        >
          {o.label} <span style={{ opacity: 0.5, fontSize: '11px' }}>{o.key}</span>
        </button>
      ))}
    </div>
  )
}
