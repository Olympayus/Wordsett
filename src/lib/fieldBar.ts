/** 色条某一行的上下延伸量（v0.7.4 决定八）。
 *  相邻两行各有 ROW_PADDING_Y 的内边距，条原本各占行内、中间隔 2×padY 的空白，
 *  看上去就是虚线段。段中间的行走满这两段空白，于是同段内相接成一条线；
 *  段首 / 段末不收（保持 0 内缩），段与段之间因此自然留出断点。
 *  负值即「伸出本行 padding 盒之外」，条本身是绝对定位元素，不占位、不影响布局。 */
export function barExtent(first: boolean, last: boolean, padY: number): { top: number; bottom: number } {
  return { top: first ? padY : -padY, bottom: last ? padY : -padY }
}
