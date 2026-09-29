import type { InitialFamiliarity } from '../../lib/review/types'
import { MASTERY_COLORS, masteryBlocks } from '../../lib/review/masteryScale'
import { displayTier } from '../../lib/review/mastery'
import Tooltip from './Tooltip'
import WordMasteryTooltip from './WordMasteryTooltip'

/**
 * 记忆强度 chip（v0.6.4；出题依据 03 §3.3 + V8 原型 M4）。
 *
 * 形态：`记忆强度` 标签 + 5 格 7×9px 小方块，**填满的格子全部用该档的颜色**，
 * 空格是发丝线色（= MASTERY_COLORS[0]，即档 0 的中性色，读起来就是「空格」）。
 *
 * 只出现在**词条卡词头右侧**。词表行不加——行首已有「编织线」（选中变蓝、悬停加深），
 * 再叠一条色条会撞车（spec D4）。
 *
 * 档位走 displayTier：有复习记录以 FSRS 为准，没有才回落到收录时选的熟悉度。
 * 悬停浮层（WordMasteryTooltip，v0.6.5 spec 4.13）补上逐卡明细与读数来源的解释；
 * 它的可测部分 masteryTooltipModel 住在 masteryScale.ts，chip 这条边不参与计算。
 */
export default function StrengthChip({ wordId, stability, familiarity }: {
  wordId: string
  stability: number | null
  familiarity: InitialFamiliarity
}) {
  const tier = displayTier({ stability, familiarity })
  const { filled, total } = masteryBlocks(tier)
  const color = MASTERY_COLORS[tier]
  return (
    <Tooltip content={<WordMasteryTooltip wordId={wordId} weakestStability={stability} familiarity={familiarity} />}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2.5, flexShrink: 0 }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--color-text-secondary)', marginRight: 4, letterSpacing: '.2px' }}>
          记忆强度
        </span>
        {Array.from({ length: total }, (_, i) => (
          <i key={i} style={{
            width: 7, height: 9, borderRadius: 2, display: 'inline-block',
            background: i < filled ? color : MASTERY_COLORS[0],
          }} />
        ))}
      </span>
    </Tooltip>
  )
}
