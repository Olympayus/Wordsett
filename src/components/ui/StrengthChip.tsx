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
 * **v0.7.2 起本组件在全仓没有调用点**（dead-but-correct，故刻意不删）：工作区头带自带的
 * 「记忆强度」标签与 chip 自带的那一枚会相邻印出两遍（v0.7.2 缺陷 1），工作区改为只传
 * 「5 格方块 + 悬停明细」这一半（WordWorkbench.tsx 的 `strengthNode`，方块与浮层复用同一批
 * 共享件 `masteryBlocks` / `MASTERY_COLORS` / `displayTier` / `WordMasteryTooltip`）；返回页
 * 不量记忆强度，从来没接过它。于是带标签的整簇无人再引用。
 *
 * 组件本身仍然**正确**（档位判据、取色、悬停明细与调用方那一半逐字同源），缺的只是一个
 * 「不印标签」的开关。要把这段方块组装收回这里，正确做法是给它加 `showLabel`（默认 true，
 * 工作区传 false）并让头带经 `strength` 消费——**不要**在调用方再复制一次排版。
 *
 * 上面这段取代了 v0.7.2 之前那句「只出现在词条卡词头右侧」——那句话描述的是 v0.6.4 的
 * 唯一调用点，现已不存在。词表行至今仍不加 chip（行首已有「编织线」：选中变蓝、悬停加深，
 * 再叠一条色条会撞车，spec D4）——这条仍然有效，且正是「不得在任何行首复活它」的边界。
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
