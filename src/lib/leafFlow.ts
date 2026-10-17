import { childKind } from './fieldKind'

/**
 * 「一行多条」的判据（v0.7.3 §5.4、§1.4）。
 *
 * 形状判据只对 `plain` 那一格有效——它分不清「短例句」与「短近义词」，两者都是「多条短叶子」。
 * 故先由容器类别（`lib/fieldKind.childKind`）定档：
 *   · `example`（例句容器）恒 false——一条就是一句话，并排成 `·` 并列会读不成句；
 *   · `list`（六个列举容器）单条也成列——「即使只有一个词」；
 *   · `plain`（其余，含用户自建字段与辨析组）沿用原有的两条形状门槛。
 *
 * 两条形状门槛（仅 `plain` 走）：
 *   · **全部是叶子**——带子节点的容器不是「一条一条的短内容」，是子结构；
 *   · **每条都短**（≤ LEAF_FLOW_MAX_CHARS）。
 */
export const LEAF_FLOW_MIN_ITEMS = 2
export const LEAF_FLOW_MAX_CHARS = 40

export function isLeafFlow(
  children: { value: string | null; childCount: number }[],
  containerKey?: string,
): boolean {
  const kind = childKind(containerKey ?? '')
  if (kind === 'example') return false
  if (children.length < (kind === 'list' ? 1 : LEAF_FLOW_MIN_ITEMS)) return false
  for (const c of children) {
    if (c.childCount > 0) return false
    if ((c.value ?? '').length > LEAF_FLOW_MAX_CHARS) return false
  }
  return true
}
