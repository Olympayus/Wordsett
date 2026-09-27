/**
 * 结果区的版式常量与列数规则（v0.6.3 条目 16）。
 *
 * 抽成独立模块而不是写在 ResultBlock 里：断点同时被 ReviewArena（内容区上限）与
 * ResultBlock（列数）消费，放在组件里会让 ReviewArena 反向 import 一个渲染组件。
 */

/** 窄屏下作答块的阅读上限（px）。完整词条不设限：它是网格里的第二轨，单列时本就占满整宽。 */
export const NARROW_READING_WIDTH = 560

/**
 * 两栏断点。与内容区上限**取同一个数**——两处不同值会出现「窗口够宽了但内容区还是 960」的二义。
 *
 * 算式（Tailwind preflight 是 border-box，内容区 p-8 = 32px/边，故内容盒比 maxWidth 窄 64）：
 * 宽屏模板 `minmax(0, 1fr) 268px` 的**右轨是定宽、永不被压**，随窗口变的是左轨
 * ＝ 内容盒 − 268 − 22(gap)。960px 上限 → 内容盒 896 → 左轨 606；
 * 1100px 上限 → 内容盒 1036 → 左轨 746、右轨 268。
 * 即 1100 换来的不是「右栏不再被挤」，而是左轨多 140px（746 撑得下作答行 + 三键 + 下一题，
 * 606 偏紧）。设计稿 §6.5 写的「960 下右栏会被挤到 240px 以下」与定宽右轨不符，
 * 这里按实际盒子模型记；1100 保留（与上限同数是硬约束）。
 */
export const RESULT_BREAKPOINT = 1100

/** 宽屏下内容区的 maxWidth（px）。由断点派生，写死字符串会与断点悄悄分家。 */
export const RESULT_CONTENT_WIDTH = `${RESULT_BREAKPOINT}px`

/**
 * 结果区网格的列定义。窄屏单列＝「完整词条置底」：DOM 顺序就是作答在前、词条在后，
 * 单列时天然从上往下排，不需要 order 调整。
 *
 * 宽屏两轨：右轨定宽 268px，否则词条会跟着窗口无限拉宽、例句行长失控；
 * 左轨 minmax(0, 1fr)，允许它被压到内容宽以下，否则长释义会把网格顶破。
 * 窄屏只有一轨，同样是 minmax(0, 1fr)——此时左轨要装作答与三键。
 */
export function resultGridColumns(narrow: boolean): string {
  return narrow ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 268px'
}
