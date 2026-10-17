import type { ReactNode } from 'react'
import { SourceBar } from './SourceMark'
import type { FieldState } from '../../lib/fieldState'

/**
 * 短条目字段的一行多条（v0.7.3 §5.4）。
 *
 * 与 `FlowRow` 是兄弟：`FlowRow` 输出「一行一条」的义项行，本组件把同一容器下的兄弟叶子
 * 排成流式多列。每条前一枚「·」（三级色），与例句前的「–」是同一套语言。
 *
 * 用 flex-wrap 而不是固定列数：词长差异极大（`dine` 与 `clear: 清除（拉丁 clarus 明亮）`
 * 差三倍），固定列数会让短词后半列全空、长词被省略号截断；流式排法让长条目自己占满一行。
 *
 * 不参与编号：这类行本来就没有义号（`FlowRow` 的 `no` 不传），多列后也不引入。
 * 左缘与 `FlowRow` 一致（11px），故它仍是同一条正文流里的块。
 *
 * `items` 是 `{ content, end? }[]`（v0.7.3 控制器裁决 P4、尾段 §3.4）：两个调用页各自把
 * **今天渲染的那个节点**原样交进来——工作区传 `{ content: ch.value, end: … }`（它的叶子行
 * 本就只渲染 `fv.value`），返回页传 `{ content: renderContent(c) }`（保住 `标签: 值` 的拆写、
 * **不传 `end`**）。这样两页的文本渲染逐字不变，也不必再写第二份拆分实现。
 *
 * `end` 是**单位自己的行尾槽**（v0.7.3 尾段 §3.4）：每个单位一枚 22px 的操作簇
 * （近义词 → `⋯` 编辑 / 删除），绝对定位在本单位右缘之外那 22px 里。**必须绝对定位**——
 * 它一进排版流，悬停那一刻该单位就变宽、后继的词重新折行（与 v0.5.2 修过的行尾簇抖动同一个坑）。
 * 22px 正好等于栏距（`gap: '6px 22px'`），且按钮本身也是 22px（`NAV_CONTROL_HEIGHT`），一格一枚正好合上。
 */
export default function LeafFlow({ items, state = 'none' }: {
  items: { content: ReactNode; end?: ReactNode }[]
  state?: FieldState
}) {
  return (
    <div style={{ position: 'relative', padding: '4px 0 4px 11px' }}>
      <SourceBar state={state} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 22px' }}>
        {items.map((it, i) => (
          <span key={i} style={{ position: 'relative', fontSize: '15px', lineHeight: 1.75, color: 'var(--ink-2)' }}>
            <span style={{ color: 'var(--ink-3)', marginRight: '5px' }} aria-hidden>·</span>
            {it.content}
            {it.end && (
              <span style={{ position: 'absolute', left: '100%', top: 0, height: '100%',
                             width: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{it.end}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  )
}
