/**
 * 结果区的版式常量与列数规则（v0.6.3 条目 16）。
 *
 * 抽成独立模块而不是写在 ResultBlock 里：断点同时被 ReviewArena（内容区上限）与
 * ResultBlock（列数）消费，放在组件里会让 ReviewArena 反向 import 一个渲染组件。
 */

/**
 * 两栏断点。与内容区上限**取同一个数**——两处不同值会出现「窗口够宽了但内容区还是 960」的二义。
 * 1100 的依据：960px 下塞两栏，右栏词条会被挤到 240px 以下、例句断成三行；
 * 1100 下左栏约 790px、右栏 268px。
 */
export const RESULT_BREAKPOINT = 1100

/**
 * 结果区网格的列定义。窄屏单列＝「完整词条置底」：DOM 顺序就是作答在前、词条在后，
 * 单列时天然从上往下排，不需要 order 调整。
 *
 * 两列都用 minmax(0, 1fr) / 定宽：右列固定 268px，否则词条会跟着窗口无限拉宽、
 * 例句行长失控；左列的 minmax(0, …) 允许它被压到内容宽以下，否则长释义会把网格顶破。
 */
export function resultGridColumns(narrow: boolean): string {
  return narrow ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 268px'
}
