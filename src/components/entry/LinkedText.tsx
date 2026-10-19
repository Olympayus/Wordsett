import type { CSSProperties } from 'react'
import { linkableField, normalizeLinkTarget, parseLinks, type LinkKind, type LinkToken } from '../../lib/links'

/**
 * 阅读态的链接渲染（v0.7.5 任务 3）。
 *
 * 值在**非编辑**状态下才走这里：编辑框里仍然是原文 `[[forsake]]`（用户要能改标记），
 * 阅读态把标记隐藏、只显示可点的词面。分段交给 `parseLinks`（`lib/links.ts` 是链接语法的
 * 唯一出处），本组件不解析、不校验、不决定跳转。
 *
 * **哑组件**：不读 store、不查库、不知道工作区/储藏库。`isInLibrary` 与 `onJump` 都由调用方
 * 给——这样它能在工作区以外复用（返回页将来若要接也只换这两个 prop），而「点击去哪」的
 * 决策（工作区 / 储藏库 / 词典 / 失效提示）留给 Task 4 的 `useLinkJump`。
 *
 * 结构字段（词性 / 音标 / 词根 / 初始熟悉度）由 `linkableField` 判定为不可链接：直接输出
 * 原字符串，一个 DOM 都不多——这些字段的值是词条自身的属性，链到别的词没有语义。
 *
 * 语法写残的段（`[[forsake`）由 `parseLinks` 归到 text 段，因此永远原样显示，不会半个链接。
 */
export default function LinkedText({ value, fieldKey, isInLibrary, onJump }: {
  value: string
  /** 字段 key：不在可链接集合里就按纯文本渲染（结构字段）。 */
  fieldKey: string
  /** 目标是否在库（调用方从 store 的 `libraryIndex` 派生）；只用于 `[[ ]]` 的失效态。 */
  isInLibrary: (lemma: string) => boolean
  /** 点击链接：本组件不跳转，只把 token 交出去（Task 4 接上真实实现）。 */
  onJump: (token: LinkToken) => void
}) {
  if (!linkableField(fieldKey)) return <>{value}</>

  const segments = parseLinks(value)
  // 没有链接（或空串）：原样输出，与未接入前逐字相同、不引入包裹元素。
  if (segments.every(s => s.kind === 'text')) return <>{value}</>

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === 'text') return seg.text
        // `[[ ]]` 的失效态渲染期就知道（库里查不到 → 删除线）；`{{ }}` 的失效要查词典，
        // 只有点击时才知道，故渲染期一律不打删除线（提示由 Task 4 负责）。
        const missing = seg.linkKind === 'library' && !isInLibrary(normalizeLinkTarget(seg.target!))
        return (
          <span
            key={i}
            // 链接是独立动作：别让点击冒泡到外面那层「点击 / 双击进编辑」的触发器上。
            onClick={e => { e.stopPropagation(); onJump({ target: seg.target!, kind: seg.linkKind! }) }}
            onDoubleClick={e => e.stopPropagation()}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-brand-soft)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            style={linkStyle(seg.linkKind!, missing)}
          >
            {seg.text}
          </span>
        )
      })}
    </>
  )
}

function linkStyle(kind: LinkKind, missing: boolean): CSSProperties {
  return {
    color: 'var(--color-brand)',
    cursor: 'pointer',
    // 两种标记唯一可见的差别：库内链接实线下划线、词典链接虚线下划线。
    // `[[ ]]` 目标不在库时再加删除线（失效态）。
    textDecoration: kind === 'library'
      ? (missing ? 'underline line-through' : 'underline')
      : 'underline dotted',
  }
}
