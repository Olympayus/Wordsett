import type { ReactNode } from 'react'
import LeechBadge from '../ui/LeechBadge'
import SpeakButton from '../ui/SpeakButton'
import { formatPhonetic } from '../../lib/phonetic'
import { leechTooltip } from '../../lib/review/leech'

/**
 * 词条头带（v0.7.2）：整幅铺满，只用一道 1px 下缘线与正文分开。
 *
 * 右上角一簇是**顽固词标记 + 记忆强度**：顽固词从词头旁/行内挪到这里之后，
 * 分类与考试标签所在的字段行不再被它推位置（v0.7.2 的两条改动要求）。
 * 头带里的字段行由调用方给（工作区给可编辑的，返回页给可勾选的），
 * 因为「这一行能不能编辑/勾选」是页面私有的行为。
 */
export default function EntryBand({ headword, phonetic, speak = true, leechCount, strength, rows }: {
  headword: string
  phonetic?: string
  speak?: boolean
  /** 连错次数；给了才渲染右上角的顽固词标记 */
  leechCount?: number
  /** 记忆强度那一簇（传现成的 StrengthChip） */
  strength?: ReactNode
  /** 音标 / 词根 / 分类等字段行 */
  rows?: ReactNode
}) {
  return (
    <div style={{ borderBottom: '1px solid var(--color-border)', padding: '14px 0 12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: '31px', fontWeight: 600, lineHeight: 1.15, letterSpacing: '-.01em' }}>{headword}</span>
        {speak && <SpeakButton text={headword} size={16} />}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11.5px', color: 'var(--color-text-tertiary)' }}>
          {leechCount !== undefined && <><LeechBadge count={leechCount} compact /><span>顽固词 · {leechTooltip(leechCount)}</span></>}
          {strength && <><span style={{ marginLeft: leechCount !== undefined ? '6px' : 0 }}>记忆强度</span>{strength}</>}
        </span>
      </div>
      {phonetic && (
        <div style={{ display: 'flex', gap: '10px', marginTop: '7px', fontSize: '13px' }}>
          <span style={{ width: '62px', flex: 'none', fontSize: '11.5px', color: 'var(--color-text-tertiary)', paddingTop: '2px' }}>音标</span>
          <span style={{ fontFamily: 'var(--font-phonetic)', fontSize: '15px' }}>{formatPhonetic(phonetic)}</span>
        </div>
      )}
      {rows}
    </div>
  )
}
