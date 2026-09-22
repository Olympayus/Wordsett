// 同级拖动重排的落点判定（v0.5.3 任务 4）
//
// 为什么按「指针」而不是按「拖动卡片自身」判定插入前后：
// 本组件不把 dnd-kit 的 transform 套到被拖卡片上（拖动反馈只有 scale + 插入线），
// 卡片在文档里不跟随指针移动，dnd-kit 给的 active.rect.current.translated 是
// 「卡片原位 + 指针位移」。若按卡片顶边判定，阈值就变成
// 「指针须越过目标卡片中线 + 抓取偏移（手柄到卡片顶边的距离）」——
// 矮行（例句 / 近义词项：卡片高 36px，手柄 14px 在行内垂直居中，偏移 18px）下
// 该阈值恰好等于目标卡片的底边，落在目标矩形之外，于是「插到后面」永远选不中：
// 拖动线画在目标上沿、松手顺序不变，即「拖动换位无效果」。
// 高卡片（释义 / 词性：卡片高得多，抓取偏移 20px 上下）阈值仍落在矩形内，
// 故既有行为看上去正常——本缺陷只在矮行上显形。
// 改用指针判定后，矮行与高卡片统一为「落点越过目标中线即插到后面」。

export interface DropRect {
  top: number
  height: number
}

/** 落点纵坐标：指针位置 = pointerdown 的 clientY + 拖动位移；键盘激活没有指针，退回拖动卡片中线 */
export function dropY(activatorEvent: Event | null | undefined, deltaY: number, draggedCenterY: number): number {
  const clientY = (activatorEvent as PointerEvent | null | undefined)?.clientY
  return typeof clientY === 'number' ? clientY + deltaY : draggedCenterY
}

/** 落点在目标卡片上半 → 插到目标之前；下半（含中线）→ 插到目标之后 */
export function insertBefore(y: number, target: DropRect): boolean {
  return y < target.top + target.height / 2
}

/**
 * 同级重排：把 draggedId 移到 targetId 之前 / 之后，返回新的同级 id 顺序。
 * 落点是自身、或任一方不在同级集合内（跨父级拖动、树已变）→ 返回 null，调用方放弃写入。
 */
export function reorderSiblingIds(
  siblingIds: readonly string[],
  draggedId: string,
  targetId: string,
  before: boolean,
): string[] | null {
  if (draggedId === targetId) return null
  if (!siblingIds.includes(draggedId) || !siblingIds.includes(targetId)) return null
  const without = siblingIds.filter(id => id !== draggedId)
  const at = without.indexOf(targetId)
  without.splice(before ? at : at + 1, 0, draggedId)
  return without
}
