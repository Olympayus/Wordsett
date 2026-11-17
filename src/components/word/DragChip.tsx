import type { CSSProperties } from 'react'

/**
 * 拖拽跟手提示胶囊（v0.7.10 任务 6，规格 §7.3）。
 *
 * 只负责**画**：文案与是否禁止态由调用方给（`WordWorkbench` 按 `dropVerdict` 决定），
 * 位置由父级（`DragOverlay` 里那层相对定位的副本列）决定——本组件不碰落点判定，也不读任何状态。
 *
 * 颜色只用既有 token：品牌蓝底 + `--color-surface` 文字（浅色下是白字、深色下是深字，两个主题里
 * 都够亮）；禁止态退到暖灰（`--color-text-tertiary` 在两个主题里都是暖调中性灰）。长文案
 * 单行省略——提示是「落在谁旁边」的一句话，不换行也不该把浮层撑到屏外。
 */
const CHIP_STYLE: CSSProperties = {
  pointerEvents: 'none',
  fontSize: '12px', lineHeight: 1.4,
  padding: '4px 9px', borderRadius: '999px',
  background: 'var(--color-brand)', color: 'var(--color-surface)',
  boxShadow: 'var(--shadow-overlay)',
  width: 'max-content', maxWidth: '42em',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
}

const CHIP_INVALID_STYLE: CSSProperties = {
  background: 'var(--color-text-tertiary)',
}

export default function DragChip({ text, invalid = false }: { text: string; invalid?: boolean }) {
  return (
    <div aria-hidden="true" data-drag-chip="" style={{ ...CHIP_STYLE, ...(invalid ? CHIP_INVALID_STYLE : null) }}>
      {text}
    </div>
  )
}
