import Tooltip from './Tooltip'
import { leechTooltip } from '../../lib/review/leech'

/**
 * 顽固词徽标（v0.6.4；出题依据 03 §3.2）。词表行尾 + 词条卡头部两处用同一个组件。
 *
 * 独立形态：来源三态是**底色与文字标签**、顽固词是**徽标**、记忆强度是**方块**——
 * 三个维度分形分位，一眼可辨不混淆（§3.2）。悬停显连错次数，界面只读。
 *
 * `compact`（v0.7.2）：侧栏行 1 右上角用的 6px 方块。那里没有位置摆下带边框的「顽固词」
 * 小牌，故只留一个小方块；文案仍由 `leechTooltip` 组装（**不重写「连错 N 次」的字面**，
 * 否则这里与完整徽标就成了两处会各自漂的真源）。方块没有可见文字，可及名必须显式给出
 * ——与完整徽标的可见文字同口径。
 */
export default function LeechBadge({ count, compact = false }: { count: number; compact?: boolean }) {
  if (compact) {
    return (
      <Tooltip content={`顽固词 · ${leechTooltip(count)}`}>
        <span
          aria-label={`顽固词 · ${leechTooltip(count)}`}
          style={{
            display: 'block', width: '6px', height: '6px', borderRadius: '1px',
            background: 'var(--color-leech)', flexShrink: 0,
          }}
        />
      </Tooltip>
    )
  }
  return (
    <Tooltip content={leechTooltip(count)}>
      <span style={{
        flexShrink: 0, whiteSpace: 'nowrap',
        fontFamily: 'var(--font-sans)', fontSize: '10.5px', fontWeight: 'var(--weight-semibold)',
        color: 'var(--color-leech)', border: '1px solid var(--color-leech)',
        borderRadius: 'var(--radius-sm)', padding: '1px 5px',
      }}>顽固词</span>
    </Tooltip>
  )
}
