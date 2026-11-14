import type { ReviewStrategy } from '../../lib/review/types'
import type { StrategyMeta } from './StrategyList'

interface Props {
  strategies: StrategyMeta[]
  active: ReviewStrategy
  onSelect: (s: ReviewStrategy) => void
}

/**
 * 手机端策略切换（v0.7.6）：一枚凹陷的分段控件，替代桌面左栏的 StrategyList。
 *
 * 选中态与桌面列表同一套语言——面 + 描边 + 600，不用品牌蓝（策略是入口，不是「状态」）。
 * `data-session-guard` 与会话守卫共用：点这两个按钮离开进行中的会话时由 SessionGuard 拦截。
 */
export default function StrategyTabs({ strategies, active, onSelect }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        padding: 3,
        background: 'var(--color-surface-sunken)',
        border: '1px solid var(--color-border)',
        borderRadius: '9px',
        gap: 3,
      }}
    >
      {strategies.map(s => {
        const on = s.key === active
        return (
          <button
            key={s.key}
            type="button"
            aria-current={on ? 'true' : undefined}
            data-session-guard={`strategy:${s.key}`}
            onClick={() => onSelect(s.key)}
            style={{
              flex: 1,
              height: 38,
              borderRadius: 7,
              cursor: 'pointer',
              background: on ? 'var(--color-surface)' : 'transparent',
              border: `1px solid ${on ? 'var(--color-border-strong)' : 'transparent'}`,
              color: 'var(--color-text-primary)',
              fontSize: '13.5px',
              fontWeight: on ? 600 : 400,
              fontFamily: 'var(--font-sans)',
            }}
          >
            {s.label}
          </button>
        )
      })}
    </div>
  )
}
