import type { FieldState } from '../../lib/fieldState'

/**
 * 来源三态的标记（v0.7.2）。
 *
 * 先前同一语义有三处近乎重复的实现：`WordWorkbench` 的 `FIELD_LEFT_COLOR` 左条、
 * 卡片上的「已编辑 / 个人」小徽章、以及 `fieldState.FIELD_STATE_BG` 的底色表。
 * 现在统一成「形状 + 一根圆头左条」，颜色只承担**数据标记**的意思：
 * 个人 = 陶土（唯一彩色的来源标记），已编辑 = 品牌蓝的空心方（那是字段的**状态**，不是内容分类）。
 * 底色不再参与**卡片**的编码——卡片底色现在是三档面的事。但 `FIELD_STATE_BG` 仍给**音标行**
 * 按三态上底色（PhoneticArea.tsx），故底色只对卡片退出编码，不是全仓退出。
 */
export default function SourceMark({ state }: { state: FieldState }) {
  if (state === 'original') return null
  const personal = state === 'personal'
  return (
    <span
      role="img"
      aria-label={personal ? '个人' : '已编辑'}
      style={{
        display: 'inline-block', width: '6px', height: '6px', borderRadius: '1px',
        marginLeft: '5px', verticalAlign: '1px', flexShrink: 0,
        border: `1.5px solid ${personal ? 'var(--color-accent)' : 'var(--color-weave-edited)'}`,
        background: personal ? 'var(--color-accent)' : 'transparent',
      }}
    />
  )
}

/**
 * 义项左缘那根圆头竖条（绝对定位，离开文档流）。
 *
 * 与 `SourceMark` 承载同一份信息，故自身 `aria-hidden`（两处都命名会重复播报）。
 * `original` 不渲染：来源三态由「形状标记 + 彩色左条」共同表达，原始值两者皆无；
 * 左侧留白由 `FlowRow` 自己的左内边距撑住，不靠这根条占位——绝对定位的元素本就不占位。
 */
export function SourceBar({ state }: { state: FieldState }) {
  if (state === 'original') return null
  const background =
    state === 'personal' ? 'var(--color-accent)'
    : 'color-mix(in srgb, var(--color-weave-edited) 45%, transparent)'
  return (
    <span aria-hidden style={{ position: 'absolute', left: 0, top: '4px', bottom: '4px', width: '3px', borderRadius: 'var(--radius-full)', background }} />
  )
}
