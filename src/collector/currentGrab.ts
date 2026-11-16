/**
 * 当前抓取代际（v0.7.9）。
 *
 * 收录写链结束时是否还该隐藏小窗，判据不是「组件还挂着吗」——写链中途 store 刷新
 * 词库索引会让 Root 把新词卡换成已在库卡（同一个 `grabId`，只是换了个组件），
 * 组件卸载并不代表用户已经触发新一代抓取。真正的判据是**代际**：只有仍属于当前
 * `grabId` 的写链才允许 `collector_hide`；新一代抓取已经到达时隐藏会把它一起藏掉。
 *
 * Root 在 `accept` 里（grabId 去重之后）调用 `markGrabCurrent`；写链用
 * `isGrabCurrent(grabId)` 判断。模块级状态与 Rust 侧的 `GRAB_ID` 同构。
 */

let currentGrabId = 0

/** 记录最新接受的抓取代际（只由 Root 的 `accept` 调用）。 */
export function markGrabCurrent(grabId: number): void {
  currentGrabId = grabId
}

/** 这条写链是否仍属于当前一代抓取（是 → 允许隐藏小窗）。 */
export function isGrabCurrent(grabId: number): boolean {
  return grabId === currentGrabId
}
