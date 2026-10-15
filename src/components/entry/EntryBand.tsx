import type { ReactNode } from 'react'
import LeechBadge from '../ui/LeechBadge'
import SpeakButton from '../ui/SpeakButton'
import { leechTooltip } from '../../lib/review/leech'

/**
 * 词条头带（v0.7.2）：整幅铺满，只用一道 1px 下缘线与正文分开。
 *
 * 右上角一簇是**顽固词标记 + 记忆强度**：顽固词从词头旁/行内挪到这里之后，
 * 分类与考试标签所在的字段行不再被它推位置（v0.7.2 的两条改动要求）。
 * 头带里的字段行由调用方给（工作区给可编辑的，返回页给可勾选的），
 * 因为「这一行能不能编辑/勾选」是页面私有的行为。
 */
export default function EntryBand({ headword, speak = true, leechCount, strength, savedMark, headwordEnd, rule = true, rows }: {
  headword: string
  speak?: boolean
  /**
   * 连错次数；**给了才**渲染右上角的顽固词标记（判据是 `!== undefined`）。
   * 注意 0 **不是**「缺席」值：调用方通常从 `overlay.maxLapses`（非顽固词也为 0）
   * 取值，直接传会把整库每个词都标成「连错 0 次」的顽固词。调用方须自行按策略门控，
   * 生产口径是 `isLeech(maxLapses, leechThreshold)`（见 `src/lib/review/leech.ts`，
   * 例 `WordWorkbench.tsx`）；`> 0` **不可**代用——阈值可配且 `isLeech` 在阈值为 0（「关掉」）时返回 false。
   */
  leechCount?: number
  /**
   * 记忆强度那一簇：头带在它前面**硬印一枚「记忆强度」标签**（见下方渲染），故只传「方块」那一半
   * （`WordWorkbench.tsx` 的 `strengthNode`）。**不要传整枚 `StrengthChip`**——它也带自己的
   * 「记忆强度」标签，两者会相邻印出两遍（v0.7.2 缺陷 1，即该组件如今在本仓没有调用点的由来）。
   * 要右对齐的整簇，用 `headwordEnd` 而不是这里。
   */
  strength?: ReactNode
  /**
   * 词头旁的槽位：工作区在此挂「保存确认条」（保存后短暂显示的一根品牌色竖条）。
   * 只放节点、由调用方决定何时出现与如何动——头带不引入任何状态或计时器。
   */
  savedMark?: ReactNode
  /**
   * 词头行上、词头**之后**的槽位（v0.7.2 修复 1）。内容与词头同处一行、同一基线——
   *  返回页在此放星级与喇叭，工作区今天什么都不放。
   * **只放节点、不印任何标签**：右上角那两个槽位（`leechCount` / `strength`）各自会带一句
   *  说明文字，那正是它们不能挪来这里的原因；调用方要左对齐的节点（词头旁）就传这里，
   *  要右端整簇就自己在该节点里用 `marginLeft:'auto'` 起手（与 `strength` 的右对齐同一机制）。
   */
  headwordEnd?: ReactNode
  /**
   * 头带下方那道 1px 分割线。默认 `true`（工作区要靠它分开头带与正文）。
   * 传 `false` 时头带不出线——用于「下方另有更合适的分割线」的页面，
   * 例返回页：页签条自带 2px 下缘线，用户要求「直接用 tab 作分割线」。
   */
  rule?: boolean
  /** 音标 / 词根 / 分类等字段行 */
  rows?: ReactNode
}) {
  return (
    <div style={{ ...(rule ? { borderBottom: '1px solid var(--color-border)' } : null), padding: '14px 0 12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
        {/* 保存确认条（若给）：行内基线对齐会把竖条压歪，故单独居中。 */}
        {savedMark !== undefined && <span style={{ alignSelf: 'center', display: 'inline-flex', flexShrink: 0 }}>{savedMark}</span>}
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: '31px', fontWeight: 600, lineHeight: 1.15, letterSpacing: '-.01em', whiteSpace: 'nowrap' }}>{headword}</span>
        {speak && <SpeakButton text={headword} size={16} />}
        {headwordEnd}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11.5px', color: 'var(--color-text-tertiary)' }}>
          {leechCount !== undefined && <><span aria-hidden="true"><LeechBadge count={leechCount} compact /></span><span>顽固词 · {leechTooltip(leechCount)}</span></>}
          {strength && <><span>记忆强度</span>{strength}</>}
        </span>
      </div>
      {rows}
    </div>
  )
}
