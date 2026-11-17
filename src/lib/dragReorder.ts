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

/** 拖拽落点三态（v0.7.10 任务 5）：落到自身 → none；父级不同 → invalid；否则 valid */
export type DropVerdict = 'valid' | 'invalid' | 'none'

/**
 * 同级落点判定：落到自身所在行 → 'none'（调用方不写入）；拖动项与目标的父级不同
 * → 'invalid'（跨父级拖动不支持）；父级相同 → 'valid'。根级双方的父级都是 null，视为相同。
 */
export function dropVerdict(
  draggedParentId: string | null,
  targetParentId: string | null,
  sameRow: boolean,
): DropVerdict {
  if (sameRow) return 'none'
  return draggedParentId === targetParentId ? 'valid' : 'invalid'
}

/** 把 draggedId 移到同级末尾；不在集合内时返回原数组的副本（绝不原地修改入参） */
export function appendSiblingIds(siblingIds: readonly string[], draggedId: string): string[] {
  if (!siblingIds.includes(draggedId)) return [...siblingIds]
  return [...siblingIds.filter(id => id !== draggedId), draggedId]
}

/**
 * 组末尾 / 整页末尾落点区的 droppable id（v0.7.10 任务 7）。
 * 与行的 `drop-<id>` 同族：`end-<parentId>` 是某个同级组的末尾区，根级组固定为 `end-root`
 * （根行没有自己的行容器，它的「组末尾」就是整页末尾）。节点 id 是 `crypto.randomUUID()`，
 * 不可能以 `end-` 开头，故两个前缀不会互相误认。
 */
export function endZoneId(parentId: string | null): string {
  return `end-${parentId ?? 'root'}`
}

/**
 * 解析组末尾落点区的 id：不是 `end-` 前缀 → null（调用方按行 / 单位落点处理）；
 * `end-root` → 根级组（parentId 为 null）。返回的 parentId 直接喂 `dropVerdict` 的
 * targetParentId——末尾区与行落点同一套父级口径。
 */
export function parseEndZoneId(overId: string): { parentId: string | null } | null {
  if (!overId.startsWith('end-')) return null
  const raw = overId.slice('end-'.length)
  return { parentId: raw === 'root' ? null : raw }
}

/**
 * 组末尾区的三态：over 不是末尾区 → null（交给行落点判定）；是 → 与 `dropVerdict` 同一口径，
 * 被拖行属于该 parentId 组 → 'valid'，落到其它组的末尾区 → 'invalid'。
 * `sameRow` 恒为 false：末尾区永远不是「被拖的那一行」。
 */
export function endZoneVerdict(draggedParentId: string | null, overId: string): Exclude<DropVerdict, 'none'> | null {
  const zone = parseEndZoneId(overId)
  if (!zone) return null
  return dropVerdict(draggedParentId, zone.parentId, false) === 'invalid' ? 'invalid' : 'valid'
}
