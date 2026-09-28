import { useLayoutEffect, useRef, useState } from 'react'
import { letterMatches } from '../../lib/review/typed'
import { RESULT_HALF_WIDTH } from '../../lib/review/resultLayout'
import SquareButton from '../ui/SquareButton'

export type InputKind = 'choice' | 'typed' | 'reveal'

/**
 * 选项按钮「不算换行」的高度阈值（px，v0.6.3 条目 8）。
 *
 * **这个数是按构成推算的，不是实测的**（headless 环境读不到 offsetHeight）。
 * 构成项全在能读到的地方：按钮体的内联样式给 padding 上下各 8、border 各 1、fontSize 13；
 * 行高没写在内联样式里，继承 body 的 `line-height: var(--leading-relaxed)`，
 * 而 tokens.css 里 `--leading-relaxed: 1.7`（不是 1.4）。于是
 *   单行 = 13 × 1.7 + 8×2 + 1×2 = 22.1 + 18 = 40.1
 *   两行 = 13 × 1.7 × 2 + 8×2 + 1×2 = 44.2 + 18 = 62.2
 * 判据是 `h > 阈值` 即算换行，阈值必须落在 [40.1, 62.2) 内才不会两头出错：
 * 取中点 51 —— 单行要涨到 51（再涨 11px）才误判为换行，两行要缩到 51（再缩 11px）才漏判，
 * 两边都不可能发生。改了按钮的 padding / 字号 / --leading-relaxed，这个数要跟着重算。
 */
export const CHOICE_LINE_HEIGHT = 51

/**
 * 选项格数（v0.6.3 条目 8）：默认 2×2；**任一**选项会换行时整组回落 1×4。
 *
 * 判据按容器的**实际像素高度**量，不按字数——中英文混排、半角括号都会影响实际宽度。
 * 回落是整组行为：半张 2×2 半张 1×4 会让选项宽度不一致，纵向扫读时对不齐行。
 *
 * 空列表给 2（不是 1）：没有选项时版式不该跟有选项时长得不一样。
 */
export function choiceColumns(optionHeights: number[], lineHeight: number): 1 | 2 {
  if (optionHeights.length === 0) return 2
  return optionHeights.some(h => h > lineHeight) ? 1 : 2
}

/** 取网格里每颗选项按钮的实测高度。offsetHeight 取整，舍入误差吃得下（阈值留了十几像素余量）。 */
function optionHeightsOf(grid: HTMLElement): number[] {
  return Array.from(grid.children).map(c => (c as HTMLElement).offsetHeight)
}

/**
 * 单颗选项的宽度上限（px，v0.6.3 打磨）。
 *
 * 2×2 时每颗实际拿到 (550 − 8) / 2 ≈ 271px，略高于这个上限——上限只在更宽的窗口、
 * 或回落成 1×4 时才咬得住，那时一颗要摊到 550 以上。多数选项（20 汉字以内）在 250px
 * 内不换行，与原先量出来的 250px 折线同一档，故不触发换行、不会引起整组回落 1×4；
 * 22 字以上的长释义本就该换行、进而回落——那个行为是它本来就该有的。
 *
 * 取 250 而不是 550：后者会让上限在 1×4 时完全失效（一颗就是 550），等于什么都没限。
 */
const CHOICE_OPTION_MAX_WIDTH = 250

/**
 * 键入题答案框的宽度上限（px，v0.6.3 打磨）＝ 结果区左栏上限（半栏 550），
 *  与题面块自身的限宽同一个值（题面上是裸字面量 '550px'，见 PromptCard 的说明）。
 *  收窄不为了「答得下」——半个单词也要不了那么宽——而是为了与三键、题面统一到同一条右边界：
 *  三颗评分键与题面都在 550 内结束，答案框却铺满 1100，视线会被拉出内容区之外。
 *  它限的是**输入框自己**：包裹层是 inline-block 盒，只包住输入框、不撑满题面列，
 *  故整列仍是块级撑满、题面文字照旧整宽（见下面那行 inline-block 的注释）。 */
const INPUT_MAX_WIDTH = RESULT_HALF_WIDTH

/**
 * 键入题输入框的横向几何（v0.6.3 打磨）。
 *
 * width: auto + whiteSpace: pre —— 框的宽度**跟着已输入的文字长**（按词滚动，不折行），
 * 而不是像原先 width: 100% 那样先铺满半栏再让文字在框里滚动。用户要的是「框本身短」，
 * 铺满的框即使上限压到 550 仍然是 550 宽——那不是收窄，是把上限从 1100 挪到了 550。
 * 换行（Enter）仍提交、仍去 trim，故输入中的换行不会把框撑高。
 *
 * inline-block 的包裹层：题面那个 <section> 是 flex-col，块级子项默认被 stretch 擑满，
 * 包裹层得先退成 inline-block 才会收缩到内容宽（否则 width:auto 量到的是整列）。
 */
const TYPED_INPUT_BOX: React.CSSProperties = {
  display: 'inline-block', maxWidth: `${INPUT_MAX_WIDTH}px`,
  position: 'relative', verticalAlign: 'top',
}

// 复习区可点击元素的暖橙体系（v0.6.1 §2.2）。四组值都从 --color-accent 派生：
// 底色用 -soft，描边用 accent 往白里压一阶，文字是 accent 压暗后的同色相深色。
const ORANGE_BG = 'var(--color-accent-soft)'
const ORANGE_BG_HOVER = 'color-mix(in srgb, var(--color-accent-soft) 80%, var(--color-accent))'
const ORANGE_BG_PICKED = 'color-mix(in srgb, var(--color-accent-soft) 62%, var(--color-accent))'
const ORANGE_BORDER = 'color-mix(in srgb, var(--color-accent) 35%, white)'
const ORANGE_BORDER_HOVER = 'color-mix(in srgb, var(--color-accent) 60%, white)'
const ORANGE_TEXT = 'color-mix(in srgb, var(--color-accent) 70%, black)'

// 判分着色（v0.6.1 §2.3）：只用于选择题，作答后才有。
const WRONG_BG = 'color-mix(in srgb, var(--color-danger) 14%, white)'
const RIGHT_BG = 'color-mix(in srgb, var(--color-success) 16%, white)'
const NEUTRAL_BG = 'var(--color-surface)'
const NEUTRAL_BORDER = 'var(--color-border)'

export default function AnswerInput({
  kind, options, target, letterHighlight, disabled, onSubmit, revealedInput,
}: {
  kind: InputKind
  options?: string[]
  target?: string
  letterHighlight: boolean
  disabled: boolean
  onSubmit: (input: string) => void
  /**
   * 回看态：该卡已提交的作答原文。`!== undefined`（含 `''`）时切到已判分形态并按结果着色；
   * 组件本身不因此停止响应点击——是否可点由调用方的 `disabled` 决定。
   */
  revealedInput?: string
}) {
  const [value, setValue] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState<1 | 2>(2)
  /** 上次量列数时的容器宽度。RO 只认「宽度变了」才重量——理由见下面 ResizeObserver 处。 */
  const measuredWidthRef = useRef(-1)

  // 重量一次实际高度判定是否换行（v0.6.3 条目 8）。
  // 必须在 layout effect 里做：绘制前定下列数，否则用户会看到先 2×2 再跳成 1×4 的一帧。
  // 注意 `options` 是每次渲染都新建的数组（PromptCard 那边 `p.options.map(...)` 现算），
  // 所以这个 effect 实际跟着**父组件的每一次渲染**都重量，不是只量一次。
  // `picked` / `hover` 不在依赖里：它们只改颜色（背景 / 描边 / 文字色），不改任何高度。
  useLayoutEffect(() => {
    const el = gridRef.current
    if (kind !== 'choice' || !el) return
    measuredWidthRef.current = el.getBoundingClientRect().width
    setColumns(choiceColumns(optionHeightsOf(el), CHOICE_LINE_HEIGHT))
  }, [kind, options, revealedInput, disabled])

  // 上面两处量的是「量的时候那一版」的列数，列数本身可能刚变过，所以量出来的结论未必是
  // 2 列下的真实排布：窗口拖宽到「单列放得下、两列放不下」的那一段时，会在 1 列下量出
  // 「不换行」→ 判 2 列 → 回到半宽的格子里又换行；换题时若上一张卡是 1 列，同理。
  // 换行只改高度、不改宽度，下面的 RO 宽度去重挡不住它，于是就会停在「2×2 里有一颗换行」——
  // 正是本功能要消灭的那种参差。所以补上这个复核：**进了 2 列就在 2 列下再量一次**。
  // 它不可能两周期：本 effect 只会把列数往 1 推（量到不换行时 setColumns(2) 是同值、React 直接跳过），
  // 推到 1 之后 columns !== 2 就此停手，不再从 1 回头；回到 2 只可能由上面两处外部触发
  // （换题 / 父组件重渲染 / 拖窗口）发起，而每一次外部触发最多带来 2 次状态变更（先进 2、再回落 1）。
  // 另外这两次都发生在 layout effect 里、浏览器绘制之前，中间那个 2 列态不会被画出来，不会有闪烁。
  useLayoutEffect(() => {
    const el = gridRef.current
    if (kind !== 'choice' || !el || columns !== 2) return
    setColumns(choiceColumns(optionHeightsOf(el), CHOICE_LINE_HEIGHT))
  }, [kind, columns])

  // 依赖里**不能**带 columns：换列数本身就会改变格子宽度，于是「2 列下换行 → 回落 1 列 →
  // 1 列下不换行 → 又回 2 列」是一个真的两周期，setColumns 会来回不止，表现为抖动乃至
  // React 的更新层数上限报错。改由容器宽度驱动：格子宽度是父级给的（display:grid 是块级盒，
  // auto 宽），改列数不会反过来改容器宽度，所以这里没有反馈环。
  // 宽度去重是有意的：改列数会改高度、RO 因高度变化也会回调，若照单全收就把上面那个
  // 真正的两周期请回来了。「进了 2 列要复核」由上面那个 effect 负责，它由列数驱动、
  // 不经过这里，所以不会被这次去重挡掉。
  // RO 的首次通知里宽度与上面刚量到的相同，会被下面这行挡掉，不会补一次重量。
  useLayoutEffect(() => {
    const el = gridRef.current
    if (kind !== 'choice' || !el) return
    const ro = new ResizeObserver(() => {
      const width = el.getBoundingClientRect().width
      if (width === measuredWidthRef.current) return
      measuredWidthRef.current = width
      setColumns(choiceColumns(optionHeightsOf(el), CHOICE_LINE_HEIGHT))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [kind])

  if (kind === 'choice') {
    const chosen = revealedInput ?? picked
    const shown = revealedInput !== undefined
    return (
      // grid 取代原先的 flex flex-col gap-2：gap: 8 即 gap-2，行距与改版前一致。
      // `minmax(0, 1fr)` 不能写成 `1fr`：`1fr` 的隐含 `min-width: auto` 会让长选项把格子顶宽、
      // 网格横向溢出；`minmax(0, 1fr)` 才允许格子被压到内容宽以下、让选项真的换行。
      // 这一条是本任务能否生效的关键——用 `1fr` 时回落判据永远量不出换行。
      <div
        ref={gridRef}
        style={{ display: 'grid', gap: 8, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {(options ?? []).map(opt => {
          const isPicked = chosen === opt
          const isRight = shown && opt === String(target ?? '')
          // 三态：已判分时按对错/中性着色；未判分时按「选中 / 悬停 / 默认」着色
          const bg = shown
            ? (isRight ? RIGHT_BG : isPicked ? WRONG_BG : NEUTRAL_BG)
            : (isPicked ? ORANGE_BG_PICKED : hover === opt ? ORANGE_BG_HOVER : ORANGE_BG)
          const border = shown
            ? (isRight ? 'var(--color-success)' : isPicked ? 'var(--color-danger)' : NEUTRAL_BORDER)
            : (isPicked ? 'var(--color-accent)' : hover === opt ? ORANGE_BORDER_HOVER : ORANGE_BORDER)
          const color = shown
            ? (isRight ? 'color-mix(in srgb, var(--color-success) 70%, black)'
              : isPicked ? 'color-mix(in srgb, var(--color-danger) 75%, black)'
              : 'var(--color-text-tertiary)')
            : ORANGE_TEXT
          return (
            <button
              key={opt}
              type="button"
              disabled={disabled}
              onMouseEnter={() => setHover(opt)}
              onMouseLeave={() => setHover(null)}
              onClick={() => { setPicked(opt); onSubmit(opt) }}
              style={{
                textAlign: 'left', padding: '8px 12px', borderRadius: 'var(--radius-lg)',
                border: `1px solid ${border}`, cursor: disabled ? 'default' : 'pointer',
                background: bg, color, fontSize: '13px',
                // 逐颗限宽，不是整组（v0.6.3 打磨）：四颗在 1100px 内容区里要各自摊到 250px 以上，
                // 而一颗释义实际只占两百上下。2×2 时每颗约 209px（(550−8)/2，与键入框同一个右边界），
                // 1×4 时每颗 550px。**限宽写在每颗上**——写在整个网格上等于把两列一起压到
                // 一颗的宽度，两颗各得一半，于是每颗都换行、整组无谓地回落 1×4。
                maxWidth: `${CHOICE_OPTION_MAX_WIDTH}px`,
              }}
            >
              {opt}
              {shown && (isRight || isPicked) && (
                <span style={{ float: 'right', fontSize: '11px' }}>
                  {isRight && isPicked ? '你选的 · 正确' : isRight ? '正确' : '你选的'}
                </span>
              )}
            </button>
          )
        })}
      </div>
    )
  }

  if (kind === 'reveal') {
    return (
      /* 保持原来的撑满宽：这一支原先直接作为 <section className="flex flex-col"> 的 flex 项，
         靠 align-items 默认的 stretch 铺满，与下面「提交」那支的 flex-start 是两回事。
         本任务只换按钮形态，不改此处原有的排布，故不套 alignSelf 包裹。
         tone='surface'：该 section 与 PromptCard 都不设底，最近一个设了底的祖先是
         <main> 的 --color-surface（纯白）。 */
      <SquareButton tone="surface" onClick={() => onSubmit('')}>揭示答案</SquareButton>
    )
  }

  // 逐位比对着色按码点对齐：letterMatches 不做归一，这里传已 trim 的输入；
  // 覆盖层同样按 Array.from 渲染，两侧下标才能一一对应。
  const matches = letterHighlight && target ? letterMatches(value.trim(), target) : null

  return (
    <div className="flex flex-col gap-2">
      <div style={TYPED_INPUT_BOX}>
        <input
          autoFocus
          disabled={disabled}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && value.trim()) onSubmit(value.trim()) }}
          aria-label="键入答案"
          // size 是**属性**不是样式：它定 input 的固有宽度（按字符计），配合样式里的
          // width: auto 才是「框跟着文字长、留出约 20 字符的空位」。20 ≈ 最长一个英文单词
          // + 一点余量；输入长于它时框在 INPUT_MAX_WIDTH 封顶、内容横向滚动
          // （whiteSpace: 'pre' 让它不折行）。
          size={20}
          style={{
            whiteSpace: 'pre',
            padding: '8px 10px', borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)', background: 'transparent',
            color: letterHighlight && target ? 'transparent' : 'var(--color-text-primary)',
            caretColor: 'var(--color-text-primary)', fontSize: '14px', fontFamily: 'inherit',
          }}
        />
        {/* 逐字母着色层：覆盖在输入框之上，逐位渲染正确/错误颜色（不阻断输入） */}
        {matches && (
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, padding: '8px 10px', fontSize: '14px', color: 'var(--color-text-primary)', pointerEvents: 'none', whiteSpace: 'pre' }}>
            {Array.from(value.trim()).map((ch, i) => (
              <span key={i} style={{ color: matches[i] ? 'var(--color-text-primary)' : '#c0705a' }}>{ch}</span>
            ))}
          </div>
        )}
      </div>
      {/* alignSelf 落在包裹用的 <div> 上而非按钮本身：SquareButton 是 inline-flex，
          放进上面这个 flex-col 里默认会被拉满宽（原来的原生 <button> 靠 alignSelf 躲过）。 */}
      <div style={{ alignSelf: 'flex-start' }}>
        <SquareButton tone="surface" disabled={disabled || !value.trim()} onClick={() => onSubmit(value.trim())}>
          提交
        </SquareButton>
      </div>
    </div>
  )
}
