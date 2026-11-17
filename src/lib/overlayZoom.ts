// src/lib/overlayZoom.ts
//
// 平板 `zoom` 宿主（`IndexPage`：`zoom = clamp(w/1246, .85, 1)`）下有两个坐标系必须分清：
// - `getBoundingClientRect()` / `clientX` 给出的是**视觉坐标**（祖先 zoom 已经乘进去）；
// - portal 到 `document.body` 的面板脱离了 zoom 子树，`left/top` 与视觉坐标同一刻度，
//   但它的像素尺寸按 1:1 渲染，放在缩小后的整页里会显得偏大。
//
// 因此统一口径是：**位置用视觉坐标，尺寸用 `transform: scale(zoom)` 补回**，
// `transform-origin` 取靠近锚点的一角（面板贴着哪边展开，就从哪边缩）。
// `zoom === 1` 时所有函数都退化为恒等，桌面渲染路径逐字不变。

/** 面板与锚点之间的缝隙；面板与视口边缘之间的最小余量。 */
const OVERLAY_GAP = 4
const OVERLAY_MARGIN = 4

export interface OverlayRect { left: number; top: number; right: number; bottom: number }
export interface OverlaySize { width: number; height: number }
export type OverlayPlacement = 'right' | 'below' | 'flip'
export interface OverlayScale { transform: string; transformOrigin: string }

/** 解析 computed `zoom`：Chromium 给数字（`"0.85"`），也接受百分比写法；读不到按 1。 */
function parseZoom(raw: string): number {
  const text = raw.trim()
  if (!text) return 1
  const n = text.endsWith('%') ? parseFloat(text) / 100 : parseFloat(text)
  return Number.isFinite(n) && n > 0 ? n : 1
}

/**
 * 从 `el`（含自身）向上找第一个 computed `zoom !== 1` 的祖先；没有则 1。
 *
 * 只取第一个非 1 的祖先而不是逐级相乘——本项目只有 `IndexPage` 一处缩放宿主，
 * 嵌套 zoom 不在设计范围内（规格 §7.5）。读不到 computed style（node 测试、分离文档、
 * WebKit 尚未支持时）一律退化为 1。
 *
 * **手工验证项**：真实浏览器里的 computed `zoom` 读取无法在 node 单测里驱动
 * （仓库没有 jsdom），平板模拟器 1024 / 1280 两档时手检。
 */
export function zoomOf(el: Element | null): number {
  let node: Element | null = el
  while (node) {
    const view = node.ownerDocument?.defaultView
    const raw = view ? view.getComputedStyle(node).getPropertyValue('zoom') : ''
    const zoom = parseZoom(raw)
    if (zoom !== 1) return zoom
    node = node.parentElement
  }
  return 1
}

/**
 * 面板的缩放补偿样式；`zoom === 1` 返回 null（调用点**不得**套 transform，桌面逐字不变）。
 *
 * `transformOrigin` 取默认的左上角——向右 / 向下展开的面板（提示、右键菜单、下拉、
 * 分类浮层的默认形态）里，它就是靠锚点的那一角。向左 / 向上展开的分类浮层由调用点
 * 覆盖成对应角，并同步补偿 `left/top`（见 `CategoryPickerPopover`）。
 */
export function scaleForAnchor(anchorEl: Element | null): OverlayScale | null {
  const zoom = zoomOf(anchorEl)
  if (zoom === 1) return null
  return { transform: `scale(${zoom})`, transformOrigin: 'top left' }
}

/** 视口尺寸（视觉 CSS 像素）。node 测试没有 window：不钳制。 */
function viewportSize(): OverlaySize {
  if (typeof window === 'undefined') {
    return { width: Number.POSITIVE_INFINITY, height: Number.POSITIVE_INFINITY }
  }
  return { width: window.innerWidth, height: window.innerHeight }
}

/**
 * 锚点附着型浮层的落点（视觉坐标）。
 *
 * - `panel` 是面板的**布局尺寸**（CSS px），钳制时按 `× zoom` 换算成视觉尺寸；
 * - `right` / `below` 贴锚点右缘 / 下缘，隔 `OVERLAY_GAP`；
 * - `flip` 优先右侧，放不下改走下方；两边都放不下时选余量更大的一侧；
 * - 最后整体钳回视口（`OVERLAY_MARGIN`），面板比视口还大时停在左上余量处。
 *
 * `zoom === 1` 且面板尺寸已知时，结果与 `clampMenuPosition` 逐字一致。
 */
export function positionFor(
  anchorRect: OverlayRect,
  panel: OverlaySize,
  placement: OverlayPlacement,
  zoom: number,
): { x: number; y: number } {
  const { width: vw, height: vh } = viewportSize()
  const visualWidth = panel.width * zoom
  const visualHeight = panel.height * zoom

  const rightRoom = vw - OVERLAY_MARGIN - anchorRect.right
  const belowRoom = vh - OVERLAY_MARGIN - anchorRect.bottom
  const rightFits = rightRoom >= OVERLAY_GAP + visualWidth
  const belowFits = belowRoom >= OVERLAY_GAP + visualHeight
  const useBelow = placement === 'below'
    || (placement === 'flip' && !rightFits && (belowFits || belowRoom > rightRoom))

  const x = useBelow ? anchorRect.left : anchorRect.right + OVERLAY_GAP
  const y = useBelow ? anchorRect.bottom + OVERLAY_GAP : anchorRect.top

  return {
    x: Math.max(OVERLAY_MARGIN, Math.min(x, vw - visualWidth - OVERLAY_MARGIN)),
    y: Math.max(OVERLAY_MARGIN, Math.min(y, vh - visualHeight - OVERLAY_MARGIN)),
  }
}
