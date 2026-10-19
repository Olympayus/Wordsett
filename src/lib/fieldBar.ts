/** 色条某一行的上下延伸量（v0.7.4 决定八）。
 *  行的 padding 盒彼此相接，故中间行**只要覆盖自己的盒**（0 延伸）就与前后行首尾相接；
 *  段首 / 段末各自向内缩 `padY`，两段相接处因此留出 `2 × padY` 的断点——断点正是这样造出来的。
 *
 *  **不得用负值「伸进相邻行」**（v0.7.4 修复轮）：edited / personal 两档的条是 45% 混色、
 *  半透明的，相邻两行各伸 `padY` 会在接缝处叠成两层，颜色异常加深——即用户看到的
 *  「本应连在一起，却在每个词条的间隔处一段一段」。0 延伸既相接、又不重叠。 */
export function barExtent(first: boolean, last: boolean, padY: number): { top: number; bottom: number } {
  return { top: first ? padY : 0, bottom: last ? padY : 0 }
}
