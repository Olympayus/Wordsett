// src/lib/menuPosition.ts
//
// 坐标是视觉坐标（v0.7.10 Task 18）。平板 zoom 下 portal 面板的布局尺寸会被 `scale(zoom)`
// 缩回视觉尺寸，故钳制时要乘上 zoom；默认 1 → 桌面逐字不变。
export function clampMenuPosition(
  x: number, y: number, width: number, height: number,
  vw = window.innerWidth, vh = window.innerHeight, zoom = 1
): { x: number; y: number } {
  const visualWidth = width * zoom
  const visualHeight = height * zoom
  return {
    x: Math.max(4, Math.min(x, vw - visualWidth - 4)),
    y: Math.max(4, Math.min(y, vh - visualHeight - 4)),
  }
}
