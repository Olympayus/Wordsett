/** 分条标记（v0.7.4 决定九）：`·` 与 `–` 不再用字体字形，改**画**。
 *  字体的中点字面只有两三像素、横杠 1px 粗，来源色涂上去看不出差别（用户原话
 *  「横杠和小点分不清」）。画出来才有确定的颜色面积，也与仓里其它标记
 *  （来源色条、勾选框内块、拖拽手柄）同源——它们全是画出来的。
 *  尺寸一律 em：跟随字号，将来用户在设置里放大字号时标记一起长。
 *
 *  **横杠厚度带 2px 下限**（v0.7.4 修复轮）：0.13em 在 14px 字号下是 1.82px，背景矩形要按
 *  设备像素吸附——落在不同纵向位置会画成 1px 或 2px，于是同一页里也有粗有细、两页之间也对不齐。
 *  `max(2px, 0.13em)` 在当前字号下恒为 2px（整数、不再被吸附成两种厚度），字号放大时仍随 em 增长。 */
export const MARK_DOT_SIZE = '0.33em'
export const MARK_DASH_WIDTH = '0.8em'
export const MARK_DASH_HEIGHT = 'max(2px, 0.13em)'

export function DotMark({ color }: { color: string }) {
  return (
    <span aria-hidden style={{
      display: 'inline-block', verticalAlign: 'middle',
      width: MARK_DOT_SIZE, height: MARK_DOT_SIZE, borderRadius: '50%', background: color,
    }} />
  )
}

export function DashMark({ color }: { color: string }) {
  return (
    <span aria-hidden style={{
      display: 'inline-block', verticalAlign: 'middle',
      width: MARK_DASH_WIDTH, height: MARK_DASH_HEIGHT, borderRadius: '1px', background: color,
    }} />
  )
}
