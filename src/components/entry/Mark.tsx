/** 分条标记（v0.7.4 决定九）：`·` 与 `–` 不再用字体字形，改**画**。
 *  字体的中点字面只有两三像素、横杠 1px 粗，来源色涂上去看不出差别（用户原话
 *  「横杠和小点分不清」）。画出来才有确定的颜色面积，也与仓里其它标记
 *  （来源色条、勾选框内块、拖拽手柄）同源——它们全是画出来的。
 *  点尺寸用 em：跟随字号；横杠的**粗细**另外按设备像素取整，见下。 */
export const MARK_DOT_SIZE = '0.33em'
export const MARK_DASH_WIDTH = '0.8em'

/** 横杠的目标厚度（**设备像素**）：100% 缩放下 2px 的观感。 */
const DASH_THICKNESS_DEVICE_PX = 2

/**
 * 横杠的 CSS 高度 = 目标设备像素换算回 CSS px（v0.7.4 修复轮 2）。
 *
 * 直接写 `2px` 在 125% 缩放下是 **2.5 设备像素**：背景矩形的上下边缘会被抗锯齿摊成
 * 「2 或 3 个设备像素」，同一页里因此固定地几个粗、几个细（用户实测：100% 缩放正常，
 * 125% 才出现，且与行车位置绑定）。取整到整数设备像素后，厚度在每种缩放下都是固定的：
 * dpr 1 → 2 设备 px（'2px'）、1.25 → 3（'2.4px'）、1.5 → 3（'2px'）、2 → 4（'2px'）。
 *
 * 光有整数设备高度还不够——矩形若落在设备像素的中间，边缘仍会被摊成半透明。故
 * `DashMark` 用 SVG 的 `shape-rendering: crispEdges` 关掉抗锯齿，让边缘吸附到设备像素栅格。
 */
export function markDashHeight(dpr: number): string {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? dpr : 1
  const cssPx = Math.round(DASH_THICKNESS_DEVICE_PX * ratio) / ratio
  return `${Math.round(cssPx * 1000) / 1000}px`
}

export function DotMark({ color }: { color: string }) {
  return (
    <span aria-hidden style={{
      display: 'inline-block', verticalAlign: 'middle',
      width: MARK_DOT_SIZE, height: MARK_DOT_SIZE, borderRadius: '50%', background: color,
    }} />
  )
}

export function DashMark({ color }: { color: string }) {
  // dpr 每次渲染现读（不缓存成模块常量）：窗口被拖到不同缩放的显示器上时，下一次渲染
  // 就会用新的值。`window` 缺席（node 环境 / SSR）时按 1 处理。
  const dpr = typeof window === 'undefined' ? 1 : (window.devicePixelRatio || 1)
  return (
    <svg
      aria-hidden="true"
      style={{
        display: 'inline-block', verticalAlign: 'middle',
        width: MARK_DASH_WIDTH, height: markDashHeight(dpr), overflow: 'visible',
      }}
    >
      {/* 端头不做圆角：2–3 设备像素高的胶囊，圆角正好落在抗锯齿的噪声里，
          反而让不同行看起来粗细不一；直角矩形的厚度与长度都更稳定。 */}
      <rect width="100%" height="100%" fill={color} shapeRendering="crispEdges" />
    </svg>
  )
}
