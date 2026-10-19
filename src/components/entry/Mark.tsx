/** 分条标记（v0.7.4 决定九）：`·` 与 `–` 不再用字体字形，改**画**。
 *  字体的中点字面只有两三像素、横杠 1px 粗，来源色涂上去看不出差别（用户原话
 *  「横杠和小点分不清」）。画出来才有确定的颜色面积，也与仓里其它标记
 *  （来源色条、勾选框内块、拖拽手柄）同源——它们全是画出来的。
 *  尺寸一律 em：跟随字号，将来用户在设置里放大字号时标记一起长。
 *
 *  **横杠厚度固定 2px**（v0.7.4 修复轮）：0.13em 在 14px 字号下是 1.82px，背景矩形要按
 *  设备像素吸附——落在不同纵向位置会画成 1px 或 2px。`max(2px, 0.13em)` 只解决了尺寸的小数，
 *  行高里 0.1–0.5px 的小数仍会让 2px 高的矩形在不同纵向位置被摊成不同观感。最终做法：
 *  **厚度写成整数 2px**（不跟 em）；同时例句 / 正文的行高取整（23 / 21 / 26px，见 WordWorkbench /
 *  DictDetailCard），所有行的纵向位置落在整数像素上，横杠粗细才真正一致。
 *  宽度仍用 em——同一左缘、水平位置不随行变化。 */
export const MARK_DOT_SIZE = '0.33em'
export const MARK_DASH_WIDTH = '0.8em'
export const MARK_DASH_HEIGHT = '2px'

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
