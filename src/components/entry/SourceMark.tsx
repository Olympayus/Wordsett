import type { FieldState } from '../../lib/fieldState'

/**
 * 义项左缘那根圆头竖条（v0.7.3 起是**唯一**的来源标记）。
 *
 * 行尾那枚 6px 方点已整个退场（用户：只留颜色条）——`SourceBar` 自身**仍** `aria-hidden`：
 * 它是一根纯视觉的色条，语义由无障碍树里的其他部分承载；去掉 `aria-hidden` 只会让屏幕
 * 阅读器读出一串无意义的空节点（方点在时它尚可与之去重，如今没有第二处了，但本组件
 * 也从未承担命名职责）。
 *
 * `'none'` 不渲染（普通模式与词性窗格）；`'original'` 出中性条——这是 v0.7.3 的新语义，
 * 也是「默认值也有默认颜色的颜色条」这条要求的落点。
 *
 * 左侧留白由 `FlowRow` / `LeafFlow` 自己的左内边距撑住，不靠这根条占位——绝对定位的元素
 * 本就不占位。
 */
export function SourceBar({ state }: { state: FieldState }) {
  if (state === 'none') return null
  const background =
    state === 'personal' ? 'var(--color-accent)'
    : state === 'edited' ? 'color-mix(in srgb, var(--color-weave-edited) 45%, transparent)'
    : 'var(--color-weave-original)'
  return (
    <span aria-hidden style={{ position: 'absolute', left: 0, top: '4px', bottom: '4px', width: '3px', borderRadius: 'var(--radius-full)', background }} />
  )
}
