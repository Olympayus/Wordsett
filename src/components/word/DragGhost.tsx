import { ROW_LINE_HEIGHT } from '../../lib/layout'
import { DashMark } from '../entry/Mark'

/**
 * 拖拽副本（v0.7.4 任务 16）：跟手的那一份「浮起来的行」。
 *
 * 只负责**画**：`text` 是调用方从字段树里解析出的这一行的纯文本（例句 / 单位 / 释义都走它），
 * `kind` 只决定用哪副字体壳——`example` 走例句的衬线斜体 + `–`（与工作区、返回页同一套），
 * 其余走正文。解析（两种可拖 id、取不到时不渲染）归 `WordWorkbench`，本组件不碰 id。
 *
 * 外层样式是任务书给定的逐字值：投影 + 品牌描边 + 一点放大给出「浮起来」。`scale(1.02)` 可以
 * 留在副本自身——`DragOverlay` 只在外层套 dnd-kit 的**平移**，缩放不是平移；但子元素不得再加
 * 任何 transform，否则会与那层平移叠成错位。
 *
 * `--shadow-overlay` 给它是合规的：本仓「阴影只给浮层」，而被拖的行此刻就是浮层。
 */
export default function DragGhost({ text, kind }: { text: string; kind: 'example' | 'plain' }) {
  return (
    <div
      aria-hidden="true"
      style={{
        background: 'var(--color-surface)', border: '1px solid var(--color-brand)',
        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-overlay)',
        padding: '5px 10px 5px 11px', fontSize: '15px', lineHeight: ROW_LINE_HEIGHT,
        transform: 'scale(1.02)', width: 'max-content', maxWidth: '42em',
      }}
    >
      {kind === 'example' ? (
        // 例句壳：与 FieldCard / DictDetailCard 的 example 分支同族（衬线斜体 + 画出来的 `–`）。
        // 字号取行内例句的 14px，而不是外层的 15px——「同一副字体壳」包括它看起来仍是例句。
        <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: '14px', lineHeight: 1.65, color: 'var(--ink-2)' }}>
          <span style={{ marginRight: '8px' }}><DashMark color="var(--ink-3)" /></span>{text}
        </span>
      ) : text}
    </div>
  )
}
