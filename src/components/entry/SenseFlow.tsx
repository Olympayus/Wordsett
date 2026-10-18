import type { ReactNode } from 'react'
import { ENTRY_MEASURE } from '../../lib/layout'

export interface SenseGroup {
  /** 词性缩写（`vt.` / `adj.` / `近义词`），衬线斜体起头。给了 `head` 时由 `head` 取代，可不传。 */
  pos?: string
  /** 右侧的小计数，如「中文 2 · 英 1」 */
  counts?: string
  /**
   * 自定义 run-in 头（可选）。给了它就**整块取代** `pos` / `counts` / 横线那一行，
   * 由调用方自己画头——工作区借此把头做成可交互的（拖拽手柄 / 单击编辑 / 行尾操作簇），
   * 而这些是返回页不需要的。返回页继续只传 `pos` + `counts`，行为不变。
   */
  head?: ReactNode
  /** 该组下的行，由调用方用 FlowRow 组装 */
  items: ReactNode
}

/**
 * 正文流（v0.7.2）：词性 run-in 头 + 悬挂缩进的义项行。
 *
 * 这里取代的是先前那套「导航条盒子 → 页签盒子 → 词性卡盒子 → 字段行盒子」的四层圆角嵌套。
 * 层级改由**线 + 缩进**表达：词性头后面一条长横线拉到右缘，义项靠编号槽悬挂缩进。
 *
 * 度量的默认值是 `ENTRY_MEASURE`（660），那是旧设计意图——「宽窗下多出来的宽度不放大正文，
 * 留给头带的字段行」。**v0.7.2 修复 3 起两个调用点都显式传 `ENTRY_BAND_WIDTH`（900）**：
 * 返回页的诉求是正文右缘与头带 / 页签条齐平，工作区随之跟进（同一套原语，两个页面不能各持
 * 一个正文度量）。列的内容宽 852 = 900 − 2×24 本就小于 900，故这个上限实际取不到，正文等于
 * 列的内容宽。默认值留着是为了 `SenseFlow` 单独使用时仍有一个合理上限，**不代表两页的现状**。
 */
export default function SenseFlow({ groups, measure = ENTRY_MEASURE }: { groups: SenseGroup[]; measure?: number }) {
  return (
    <div style={{ maxWidth: `${measure}px`, paddingTop: '4px' }}>
      {groups.map((g, i) => (
        <div key={i}>
          {/* 组的 run-in 头：调用方给了 `head` 就用它（工作区的可交互头），否则画标准的
              「词性缩写 + 计数 + 长横线」（返回页）。两分支的垂直间距一致。
              首个头的上间距取 4（v0.7.3 尾段 §4.1）：与上方页签条下缘的 4 + 工作区那侧 4 合起来，
              「页签条 → 首个词性头」两页都是 12px（先前是 26 与 34）。非首个头仍取 16——组间
              要比组内松，这条不动。 */}
          {g.head !== undefined ? (
            <div style={{ marginTop: i === 0 ? '4px' : '16px' }}>{g.head}</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', paddingLeft: '11px', marginTop: i === 0 ? '4px' : '16px' }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '16px', fontWeight: 600 }}>{g.pos}</span>
              {g.counts && <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{g.counts}</span>}
              <span style={{ flex: 1, borderTop: '1px solid var(--color-border)', transform: 'translateY(-3px)' }} />
            </div>
          )}
          {g.items}
        </div>
      ))}
    </div>
  )
}
