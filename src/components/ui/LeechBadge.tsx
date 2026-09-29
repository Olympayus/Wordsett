import Tooltip from './Tooltip'
import { leechTooltip } from '../../lib/review/leech'

/**
 * 顽固词徽标（v0.6.4；出题依据 03 §3.2）。词表行尾 + 词条卡头部两处用同一个组件。
 *
 * 独立形态：来源三态是**底色与文字标签**、顽固词是**徽标**、记忆强度是**方块**——
 * 三个维度分形分位，一眼可辨不混淆（§3.2）。悬停显连错次数，界面只读。
 */
export default function LeechBadge({ count }: { count: number }) {
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
