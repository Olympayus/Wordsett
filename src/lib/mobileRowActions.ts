/**
 * 手机行尾操作簇的可见性判据（spec 2026-11-14-v0.7.7 §3.2 的 A 选项）。
 *
 * **只有「有子项的顶层行」（`depth === 0 && hasChildren`）保留一枚常显的 `⋯`**；其余行——
 * 嵌套子行、顶层叶子行、短条目多列里的单位、音标 / 词根 chip——**一律不渲染任何行尾控件**，
 * 全部走长按底部表（spec §3.2 / §6.3：手机上「无 ⋯ 的行」不渲染控件，而不是渲染后隐藏；
 * 桌面那条「常驻占位、只改 opacity」的不变量只约束桌面）。
 */
export function mobileRowActionsVisible(depth: number, hasChildren: boolean): boolean {
  return depth === 0 && hasChildren
}
