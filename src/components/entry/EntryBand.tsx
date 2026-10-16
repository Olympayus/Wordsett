import type { ReactNode } from 'react'
import SpeakButton from '../ui/SpeakButton'

/**
 * 词条头带（v0.7.3）：三段骨架——头带行（词头 + 右上角簇）、字段行、右下角簇。
 *
 * v0.7.2 时右上角一簇是**顽固词标记 + 记忆强度**；v0.7.3 把它们挪到**最后一行右端**
 * （`bottomRight`），因为两者都带说明文字（「顽固词 · 连错 4 次」「记忆强度」），
 * 与分类 / 徽标挤在同一行会互相推位置。头带行的右端改由 `rightCluster` 承载。
 * 头带里的字段行由调用方给（工作区给可编辑的，返回页给可勾选的），
 * 因为「这一行能不能编辑/勾选」是页面私有的行为。
 */
export default function EntryBand({ headword, speak = true, savedMark, headwordEnd, rule = true, rows, rightCluster, bottomRight }: {
  headword: string
  speak?: boolean
  /**
   * 词头旁的槽位：工作区在此挂「保存确认条」（保存后短暂显示的一根品牌色竖条）。
   * 只放节点、由调用方决定何时出现与如何动——头带不引入任何状态或计时器。
   */
  savedMark?: ReactNode
  /**
   * 词头行上、词头**之后**的槽位（v0.7.2 修复 1）。内容与词头同处一行、同一基线——
   *  返回页在此放星级与喇叭，工作区今天什么都不放。
   * **只放节点、不印任何标签**；要右端整簇请用 `rightCluster`——本节点作为 flex 项会
   *  收缩到内容宽度，在里面写 `marginLeft:'auto'` 没有余量可分，等于没生效（v0.7.2 返回页
   *  的徽标因此贴在星级后面）。
   */
  headwordEnd?: ReactNode
  /**
   * 头带下方那道 1px 分割线。默认 `true`，但 **v0.7.3 起两个调用点都传 `false`**，
   * 无一处再用默认值：工作区与返回页的分割都由页签条自己那道 2px 下缘线承担
   * （返回页是用户要求「直接用 tab 作分割线」；工作区在 v0.7.3 跟进同一口径）。
   * 传 `false` 时头带不出线——用于「下方另有更合适的分割线」的页面。
   */
  rule?: boolean
  /** 音标 / 词根等字段行（分类 v0.7.3 起不再是字段行，已挪进 `rightCluster`） */
  rows?: ReactNode
  /**
   * 头带行**右端**的整簇（v0.7.3）：工作区放分类胶囊、返回页放考试 / 领域徽标。
   * 只放节点、由调用方决定内容；整簇的右对齐由头带自己做（见下方渲染）。
   */
  rightCluster?: ReactNode
  /**
   * 头带**最后一行右端**的整簇（v0.7.3）：顽固词 + 记忆强度。
   * 放最后一行右端而不是头字行右端——它们带说明文字，与分类 / 徽标挤在同一行会互相推位置。
   *
   * **标签由调用方印，且只许印一遍**：头带自身**不**印任何标签（v0.7.2 那两个自带标签的
   * `leechCount` / `strength` 槽位已废），故「记忆强度」这四个字由本簇的调用方写出
   * （见 `WordWorkbench.tsx` 的 `bottomRight`），而**传进来的只能是方块那一半**
   * （该页的 `strengthNode`）。**不要传整枚 `StrengthChip`**——它也带自己的「记忆强度」标签，
   * 两者会相邻印出两遍（v0.7.2 缺陷 1，即该组件如今在本仓没有调用点的由来）。
   */
  bottomRight?: ReactNode
}) {
  return (
    <div style={{ ...(rule ? { borderBottom: '1px solid var(--color-border)' } : null), padding: '14px 0 14px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
        {/* 保存确认条（若给）：行内基线对齐会把竖条压歪，故单独居中。 */}
        {savedMark !== undefined && <span style={{ alignSelf: 'center', display: 'inline-flex', flexShrink: 0 }}>{savedMark}</span>}
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: '31px', fontWeight: 600, lineHeight: 1.15, letterSpacing: '-.01em', whiteSpace: 'nowrap' }}>{headword}</span>
        {speak && <SpeakButton text={headword} size={16} />}
        {headwordEnd}
        {/* 右上角整簇（v0.7.3）：工作区放分类胶囊、返回页放考试 / 领域徽标。
            这一层必须是头带行的**直接子节点**并且自己持 marginLeft:auto——先前返回页把
            TitleChips 塞在 headwordEnd 里、由簇自己写 marginLeft:auto，而 headwordEnd 作为
            flex 项会收缩到内容宽度，那个 auto 边距在它自己的盒子里没有余量可分，等于没生效，
            徽标因此贴在星级后面（用户看到的「严重靠左」）。 */}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', minWidth: 0 }}>
          {rightCluster}
        </span>
      </div>
      {rows}
      {/* 右下角整簇（v0.7.3）：顽固词 + 记忆强度。放最后一行右端而不是头字行右端——
          它们带说明文字（「顽固词 · 连错 4 次」「记忆强度」），与分类 / 徽标挤在同一行会互相推位置。 */}
      {bottomRight !== undefined && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px',
                      marginTop: '9px', fontSize: '11.5px', color: 'var(--color-text-tertiary)' }}>
          {bottomRight}
        </div>
      )}
    </div>
  )
}
