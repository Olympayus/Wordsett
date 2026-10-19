import type { ReactNode } from 'react'
import { ROW_LINE_HEIGHT, ROW_PADDING_Y } from '../../lib/layout'
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
 * 返回页（`DictDetailCard.tsx`）分两档（v0.7.4 决定五 5.1）：顶层 run-in 头下的行把 `no`
 * **原样传**——只有本来无编号的行失去空槽（正文落到 11px，与头文字同缘），带编号的释义行
 * 照旧悬挂；内层容器下的行显式给 `no ?? ''`，那一页的设计稿**要**空编号槽
 * （showcase-v2:831 的 `<span class="no"></span>`），例句 / 近义词行靠它与释义行对齐（41px）。
 *
 * `state` 默认 `'none'`（v0.7.3，原为 `'original'`）：调用方都会显式传，默认值取 `'none'`
 * 是为了「忘了传」时**不出条**，而不是给每一行画一条灰线。
 *
 * **选中框（v0.7.3 §7.3，`focused`）**：该行正在编辑或被拖动时出 1px 品牌蓝描边 + 极轻品牌底色，
 * 且**只在这一行**。蓝在这里是「正在编辑」的**状态**，符合蓝色收窄规则第 1 条（不做按钮底、
 * 不做「可点」提示、不做内容数据标记）。
 *
 * 描边用 **`inset 0 0 0 1px` 的内阴影**，而不是 border + 负外边距（控制器裁决 P11）。内阴影画在
 * border 盒**内侧**、完全不参与布局：padding 盒、margin 盒、文字内缘、行尾槽全都不动，两态之间
 * 不需要任何算术。border 之所以不行，是因为它进布局、把 padding 盒整体推歪——左缘那根绝对定位的
 * `SourceBar` 正是锚在**本行的 padding 盒**上的（`left: 0`，见 SourceMark.tsx），一旦 padding 盒
 * 左移（负外边距 −6 + 描边 1 = −5px），那根条会跟着跳 5px，而它与文字的间距也从 11px 涨到 16px；
 * 文字本身靠 padding 重排仍可对齐，但一个**看得见的行内元素**位移了，仍违反「进出编辑态不得有位移」。
 * outline 同样出局：它画在 padding **外侧**，紧贴上一行的 3px 内边距与那根 SourceBar，行与行之间会
 * 挤成一团；且本态还需要底色填充，outline 给不了。内阴影则描边与底色一并给足，是三者中唯一
 * 「既在行内、又不进布局」的做法。故两态的 padding 逐字相同（`3px 0 3px 11px`），`focused` 只加
 * 三样不参与布局的东西：内阴影描边、圆角、底色。
 */
export default function FlowRow({ no, children, end, state = 'none', first = true, last = true, focused = false }: {
  no?: number | string
  children: ReactNode
  end?: ReactNode
  state?: FieldState
  /** 本行是否是其所属段的**首行**（v0.7.4 决定八）：段首不向上延伸色条。默认 true = 独立成段。 */
  first?: boolean
  /** 本行是否是其所属段的**末行**：段末不向下延伸色条。默认 true = 独立成段。 */
  last?: boolean
  /** 该行正在编辑或被拖动（v0.7.3 §7.3）：出选中框，**只在这一行**。 */
  focused?: boolean
}) {
  return (
    <div style={{
      display: 'flex', gap: '12px', padding: `${ROW_PADDING_Y}px 0 ${ROW_PADDING_Y}px 11px`, position: 'relative',
      ...(focused
        ? { boxShadow: 'inset 0 0 0 1px var(--color-brand)', borderRadius: 'var(--radius-md)',
            background: 'var(--color-brand-soft)' }
        : null),
    }}>
      <SourceBar state={state} first={first} last={last} />
      {no !== undefined && (
        <span style={{ width: '18px', flex: 'none', fontSize: '12.5px', textAlign: 'right',
                       color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums', paddingTop: '2px' }}>
          {no}
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0, fontSize: '15px', lineHeight: ROW_LINE_HEIGHT }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
          <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
          {end && <span style={{ marginLeft: 'auto', flex: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>{end}</span>}
        </span>
      </span>
    </div>
  )
}
