/**
 * 侧栏选择模式的选择集运算（v0.6.5 §4.2）。
 *
 * 抽成纯函数的原因：Shift 范围选、全选作用域、以及「列表变化后剪枝」这三件事各有各的坑
 * （反向拉范围、筛选后全选的范围、不可见项残留），而组件里测不到它们——vitest 跑在 node 环境。
 */

/**
 * Shift 范围选：从锚到目标之间（含两端）的行全部并入选中集。
 *
 * 只做并集、不做替换：这样「先点几个、再 Shift 拉一段」是叠加的，与文件管理器的直觉一致。
 * 锚缺失或已不在当前行里（筛选把它滤掉了）时退化成对目标的单点切换——不猜一个错误的起点。
 */
export function rangeSelect(
  rowKeys: string[],
  anchorKey: string | null,
  targetKey: string,
  current: Set<string>,
): Set<string> {
  const to = rowKeys.indexOf(targetKey)
  const from = anchorKey === null ? -1 : rowKeys.indexOf(anchorKey)
  if (to < 0) return new Set(current)
  if (from < 0) {
    const next = new Set(current)
    if (next.has(targetKey)) next.delete(targetKey); else next.add(targetKey)
    return next
  }
  const next = new Set(current)
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  for (let i = lo; i <= hi; i++) next.add(rowKeys[i])
  return next
}

/** 全选：**只选传进来的行**。调用方传的必须是当前实际渲染的行，不是全库。 */
export function selectAll(rowKeys: string[]): Set<string> {
  return new Set(rowKeys)
}

/**
 * 剪枝：把已不在当前列表里的键剔掉。
 *
 * 不做这一步，批量删除会删到用户已经看不见的词——筛选或切视图让某行消失后，
 * 它仍留在选中集里，而用户在屏幕上找不到它。
 *
 * 无变化时**返回原实例**：调用点在 useEffect 里 setState，返回新实例会让每次列表变动
 * 都触发一轮重渲染。
 */
export function pruneToRows(selected: Set<string>, rowKeys: string[]): Set<string> {
  const alive = new Set(rowKeys)
  let changed = false
  const next = new Set<string>()
  for (const k of selected) {
    if (alive.has(k)) next.add(k); else changed = true
  }
  return changed ? next : selected
}
