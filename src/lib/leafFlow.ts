/**
 * 「一行多条」的判据（v0.7.3 §5.4）。
 *
 * 判据**不看字段 key**：近义词 / 词源相关词 / 派生词 / 补充 / 词形变化这些「条多、每条短」的
 * 容器自动命中，而用户自建的同类字段也一样命中——写死 key 列表会让自定义字段掉队。
 *
 * 两条门槛缺一不可：
 *   · **全部是叶子**——带子节点的容器不是「一条一条的短内容」，是子结构；
 *   · **每条都短**（≤ LEAF_FLOW_MAX_CHARS）——例句字段同样是多条叶子，但一条就是一句话，
 *     并排成一行多条会读不成句。长度门槛挡的就是它。
 */
export const LEAF_FLOW_MIN_ITEMS = 2
export const LEAF_FLOW_MAX_CHARS = 40

export function isLeafFlow(children: { value: string | null; childCount: number }[]): boolean {
  if (children.length < LEAF_FLOW_MIN_ITEMS) return false
  for (const c of children) {
    if (c.childCount > 0) return false
    if ((c.value ?? '').length > LEAF_FLOW_MAX_CHARS) return false
  }
  return true
}
