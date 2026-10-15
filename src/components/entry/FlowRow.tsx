import type { ReactNode } from 'react'
import { SourceBar } from './SourceMark'
import type { FieldState } from '../../lib/fieldState'

/**
 * 正文流的一行（v0.7.2）。三个槽：左缘来源条 / 编号槽 / 正文 + 行尾槽。
 *
 * 编号槽固定 18px 右对齐，正文因此是**悬挂缩进**——折行后第二行与第一行左缘对齐，
 * 这是词典排版里唯一能表达「这是同一个义项的续行」的办法（先前靠一层圆角盒子）。
 *
 * `minWidth: 0` 与行尾槽的 `flex: none` 是一对：长释义因此会折行而不是把行尾的
 * 来源标与勾选框挤出视野。
 *
 * **编号槽缺席时连宽度一并消失**（v0.7.2 二轮，缺陷 3）：`no` 不传时这个 span 仍占 18px，
 * 于是同一列里「有编号的行」与「无编号的行」左缘相差 18px。工作区正文里**没有任何行带编号**
 * （`no` 两个调用点都不传），所以那 18px 全列都是白占的；而 run-in 头（`WordWorkbench.tsx`
 * 的 groupHead）根本不用 FlowRow、只直接排 grip，头的 grip 落在 11 + 10 = **21px**，
 * 子行的 grip 落在 11 + 12(gap) + 18(空槽) = **41px**，差 **20px**——正是用户看到的
 * 「词性下的中文释义/英文释义相对词形有缩进，hover 拖拽按钮错开了约两个字符」。
 * 缺席即零宽之后，两组 grip 落在同一条 **21px** 左缘上（FlowRow 自己的 11px 仍是设计稿
 * `.sense` 的缩进量，一个像素都没动；编号行的悬挂缩进也照旧）。
 *
 * 返回页（`DictDetailCard.tsx`）因此显式给 `no ?? ''`：那一页的设计稿**要**空编号槽
 * （showcase-v2:831 的 `<span class="no"></span>`），例句 / 近义词行靠它与释义行对齐。
 */
export default function FlowRow({ no, children, end, state = 'original' }: {
  no?: number | string
  children: ReactNode
  end?: ReactNode
  state?: FieldState
}) {
  return (
    <div style={{ display: 'flex', gap: '12px', padding: '4px 0 4px 11px', position: 'relative' }}>
      <SourceBar state={state} />
      {no !== undefined && (
        <span style={{ width: '18px', flex: 'none', fontSize: '12.5px', textAlign: 'right',
                       color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums', paddingTop: '2px' }}>
          {no}
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0, fontSize: '15px', lineHeight: 1.75 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
          <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
          {end && <span style={{ marginLeft: 'auto', flex: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>{end}</span>}
        </span>
      </span>
    </div>
  )
}
