/** 分条标记（v0.7.4 决定九）：`·` 与 `–` 不再用字体字形，改**画**。
 *  字体的中点字面只有两三像素、横杠 1px 粗，来源色涂上去看不出差别（用户原话
 *  「横杠和小点分不清」）。画出来才有确定的颜色面积，也与仓里其它标记
 *  （来源色条、勾选框内块、拖拽手柄）同源——它们全是画出来的。
 *  尺寸一律 em：跟随字号，将来用户在设置里放大字号时标记一起长。 */
export const MARK_DOT_SIZE = '0.33em'
export const MARK_DASH_WIDTH = '0.8em'
export const MARK_DASH_HEIGHT = '0.13em'

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
