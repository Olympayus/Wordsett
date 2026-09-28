/**
 * 答题页的版式常量与列数规则。
 *
 * 抽成独立模块而不是写在组件里：内容区上限同时被 ReviewArena 消费，
 * 放在组件里会让 PromptCard / AnswerInput / RatingBar 反向 import 一个渲染组件。
 */

/**
 * 两栏断点（视口，px）。与两栏内容区上限**取同一个数**——两处不同值会出现
 * 「窗口够宽了但内容区还是 960」的二义。
 *
 * 它管的是**下限**：视口窄于这条线一律单列（此时两栏各 400 出头，
 * 题面与词条都被压到难读）。视口够宽之后两栏各占内容区的一半，由 resultGridColumns 定。
 */
export const RESULT_BREAKPOINT = 1100

/** 两栏时内容区的 maxWidth（px）。由断点派生，写死字符串会与断点悄悄分家。 */
export const RESULT_CONTENT_WIDTH = `${RESULT_BREAKPOINT}px`

/**
 * 窄屏（单栏）时内容区的 maxWidth（px）。窄屏比宽屏窄是刻意的：单列下整行更长，
 * 正文行宽要收着读。给窄屏这一档一个名字，免得与上面那个上限各写各的字面量。
 */
export const NARROW_CONTENT_WIDTH = '960px'

/**
 * 单侧上限（px）＝ 内容区上限的一半。
 *
 * 用户要的就是这一条：「如果左侧仍有空间（即没触及 1/2 的宽度）则占满左 1/2」。
 * 即便左侧内容本身很窄、没占满那一半，它也**占满**——两栏是按 1:1 对分的，
 * 不是「左边按内容、右边吃余量」（后者在宽窗口下会在左侧留下一条空白带，
 * 看上去就是错位）。
 *
 * 两个用处，同一个值：两栏时它是每一轨的预算（列模板 1fr 1fr 天然等分）；
 * 单栏时它是左栏的 maxWidth，作答行与题面不铺满整行。
 */
export const RESULT_HALF_WIDTH = RESULT_BREAKPOINT / 2

/**
 * 答题页两栏网格的列定义。
 *
 * 单列时 DOM 顺序就是「左栏在前、完整词条在后」，单列下天然从上往下排
 * （即「完整词条置底」），不需要 order 调整。
 *
 * 两栏时**两轨等分**、各不超过内容区的一半。两轨都写 `minmax(0, …)`——
 * `1fr` 的隐含 `min-width: auto` 会让长释义把格子顶宽、网格横向溢出。
 */
export function resultGridColumns(twoColumn: boolean): string {
  return twoColumn ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)'
}
