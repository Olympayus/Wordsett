import type { ReactNode } from 'react'
import { ENTRY_MEASURE } from '../../lib/layout'

export interface SenseGroup {
  /** 词性缩写（`vt.` / `adj.` / `近义词`），衬线斜体起头 */
  pos: string
  /** 右侧的小计数，如「中文 2 · 英 1」 */
  counts?: string
  /** 该组下的行，由调用方用 FlowRow 组装 */
  items: ReactNode
}

/**
 * 正文流（v0.7.2）：词性 run-in 头 + 悬挂缩进的义项行。
 *
 * 这里取代的是先前那套「导航条盒子 → 页签盒子 → 词性卡盒子 → 字段行盒子」的四层圆角嵌套。
 * 层级改由**线 + 缩进**表达：词性头后面一条长横线拉到右缘，义项靠编号槽悬挂缩进。
 * 度量停在 ENTRY_MEASURE（660）——宽窗下多出来的宽度不放大正文，留给头带的字段行。
 */
export default function SenseFlow({ groups, measure = ENTRY_MEASURE }: { groups: SenseGroup[]; measure?: number }) {
  return (
    <div style={{ maxWidth: `${measure}px`, paddingTop: '6px' }}>
      {groups.map((g, i) => (
        <div key={i}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginTop: i === 0 ? '12px' : '16px' }}>
            <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '16px', fontWeight: 600 }}>{g.pos}</span>
            {g.counts && <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{g.counts}</span>}
            <span style={{ flex: 1, borderTop: '1px solid var(--color-border)', transform: 'translateY(-3px)' }} />
          </div>
          {g.items}
        </div>
      ))}
    </div>
  )
}
