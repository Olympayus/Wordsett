/**
 * 结果区的版式常量与列数规则。
 *
 * 抽成独立模块而不是写在 ResultBlock 里：断点与内容区上限同时被 ReviewArena 消费，
 * 放在组件里会让 ReviewArena 反向 import 一个渲染组件。
 */

/**
 * 两栏断点（视口，px）。与内容区上限**取同一个数**——两处不同值会出现
 * 「窗口够宽了但内容区还是 960」的二义。
 *
 * 它只管**下限**：视口窄于这条线一律单列（此时两栏各 400 出头，题面与快照都被压到
 * 难读）。视口够宽之后是否真的能两栏，交给下面那条按内容测的判据——
 * 断点管「屏幕放不放得下」，判据管「这个词条放不放得下」，两件事不能互相代替。
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
 * 一个数管两处：两栏时它是每一轨的预算（列模板用 1fr 1fr 对分，天然等分），
 * 单栏时它是作答行的 maxWidth——「左右两侧都不超过全部空间的一半」在单栏下
 * 依然成立，只是变成了纵向的两段。拆成两个值就会在两种版式之间各说各的。
 */
export const RESULT_HALF_WIDTH = RESULT_BREAKPOINT / 2

/**
 * 词条快照要不要与之并排（视口够宽的前提下）。
 *
 * 判据是**快照最宽的不可断行**——那些一旦放不下就会换行或溢出的内容：单词本身、
 * 音标、词性标签、窗格头行。它们合起来的自然宽度由 EntrySnapshot 量出来传进来
 * （见它的 data-nowrap / data-nowrap-row 标注），本函数只判大小，故可测。
 *
 * 宁可放过也不要判错方向：超出一半就把快照整体挪到下方（用户原话「需要超过 1/2
 * 才能正常显示则置于下方」），那是保守但无损的退路；反过来把放不下的内容硬塞进
 * 半栏，换行与溢出会比单栏难看得多。
 */
export function fitsInHalf(intrinsicWidth: number): boolean {
  return intrinsicWidth <= RESULT_HALF_WIDTH
}

/**
 * 结果区网格的列定义。
 *
 * `twoColumn` 为假时单列：DOM 顺序就是作答在前、快照在后，单列时天然从上往下排
 * （即「完整词条置底」），不需要 order 调整。
 *
 * 两栏时**两轨等分**（1fr 1fr），不再一轨定宽、一轨弹性：定宽的窄轨会在宽窗口下
 * 留出一大片空白，而那条空白正是「两侧看起来对不齐」的来源。两轨都写
 * `minmax(0, …)`——`1fr` 的隐含 `min-width: auto` 会让长释义把格子顶宽、网格横向溢出。
 */
export function resultGridColumns(twoColumn: boolean): string {
  return twoColumn ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)'
}
