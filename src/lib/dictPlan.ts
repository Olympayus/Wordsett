import type { DictionaryField } from '../types/dictionary'
import type { MergeFieldInput } from '../services/wordService'
import type { FieldSource } from '../types/field'

// 合并同词性父（跨 entry 显示为一窗格）
export function mergeEntryFields(fields: DictionaryField[]): DictionaryField[] {
  const out: DictionaryField[] = []
  const posIndex = new Map<string, DictionaryField>()
  for (const f of fields) {
    if (f.key === 'part_of_speech') {
      const existing = posIndex.get(f.value)
      if (existing) {
        existing.children = [...(existing.children ?? []), ...(f.children ?? [])]
        continue
      }
      posIndex.set(f.value, f)
    }
    out.push(f)
  }
  return out
}

// 编号规则：仅中/英释义显示 (n) 编号；近义词/例句/音标等一律不加（需求：仅中英释义编号）
export function shouldNumberField(key: string): boolean {
  return key === 'chinese_definition' || key === 'english_definition'
}

// ②a 判定：是否以无框平铺渲染子级。词性窗格与「组」容器永不平铺
// （词性保留词性→释义树与中/英释义编号；组需有框以表达组边界，v0.5.3 §2.3）；
// 仅普通容器且全部子级为终端项（无子级）时平铺。
export function shouldFlattenChildren(
  isPosPane: boolean,
  hasChildren: boolean,
  children: readonly unknown[],
  isGroupPane = false,
): boolean {
  return !isPosPane && !isGroupPane && hasChildren && children.every(c => {
    const kids = (c as { children?: unknown[] }).children
    return !(kids && kids.length > 0)
  })
}

export interface FlatNode {
  key: string
  field: DictionaryField
  children: FlatNode[]
  parentKey: string | null
}

export function flattenTree(fields: DictionaryField[]): FlatNode[] {
  const walk = (nodes: DictionaryField[], parentKey: string | null): FlatNode[] =>
    nodes.map((field, i) => {
      const key = parentKey === null ? String(i) : `${parentKey}-${i}`
      const node: FlatNode = { key, field, parentKey, children: [] }
      node.children = walk(field.children ?? [], key)
      return node
    })
  return walk(fields, null)
}

// 由勾选集构建 MergeFieldInput[]：父先子后，tempId=来源:key，子引用父 tempId；
// 隐式补选已勾选节点的全部祖先（保证无游离释义不变量）。
// 来源不再由调用方传入：合并树上的每个节点自带 source（见 lib/dictMerge），
// 手搭的树没盖戳时回落到 'user'。
export function buildMergeInputs(fields: DictionaryField[], selected: Set<string>): MergeFieldInput[] {
  const flat = flattenTree(fields)
  const all: FlatNode[] = []
  const collect = (nodes: FlatNode[]) => { for (const n of nodes) { all.push(n); collect(n.children) } }
  collect(flat)
  const parentByKey = new Map(all.filter(n => n.parentKey).map(n => [n.key, n.parentKey!]))

  const effective = new Set<string>()
  const addLineage = (key: string) => {
    if (effective.has(key)) return
    effective.add(key)
    const p = parentByKey.get(key)
    if (p) addLineage(p)
  }
  for (const k of selected) addLineage(k)

  const out: MergeFieldInput[] = []
  // parentSource 走**父节点**的来源：tempId 与 parentTempId 必须在同一命名空间，
  // 否则另一源里同路径的兄弟会把子节点挂到错误的父 tempId 下（v0.4.0 词性错位）。
  const walk = (nodes: FlatNode[], parentSource: FieldSource | null) => {
    for (const n of nodes) {
      if (!effective.has(n.key)) continue
      const src = n.field.source ?? 'user'
      out.push({
        key: n.field.key,
        value: n.field.value,
        source: src,
        tempId: `${src}:${n.key}`,
        ...(n.parentKey ? { parentTempId: `${parentSource!}:${n.parentKey}` } : {}),
      })
      walk(n.children, src)
    }
  }
  walk(flat, null)
  return out
}

// 勾选作用域：该键的后代键（键树用 `${parent}-` 前缀编码）；叶子没有后代，回落到键自身。
// `selectionState`（画什么）与 `toggleSubtreeSelection`（翻什么）共用这一份，
// 两处各算一次的话，一旦前缀规则漂移，就会画出 minus 而点下去清空整棵子树。
function scopeKeys(allKeys: string[], key: string): string[] {
  const descendantKeys = allKeys.filter(k => k.startsWith(`${key}-`))
  return descendantKeys.length ? descendantKeys : [key]
}

// 词性/容器级整体勾选：未全选 → 补全子树；全选 → 清空子树（spec §4.5）。
// v0.7.4 决定六：集合里**只存叶子键**，父键不进集合（进了就再也删不掉——本函数只动后代，
// 「合并添加」的 disabled 判据与计数都会带上一个下限）。因此调用方传进来的 allKeys 只应是叶子键。
// R21：叶子键没有后代，此时翻的键组必须回落到 [key] 自己——空数组的 every 恒真，
// 若仍以 descendantKeys 判据，叶子勾选框会永远只会删、不会加。
export function toggleSubtreeSelection(selected: Set<string>, allKeys: string[], key: string): Set<string> {
  const next = new Set(selected)
  const keys = scopeKeys(allKeys, key)
  const isOn = !keys.every(k => next.has(k))
  for (const k of keys) {
    if (isOn) next.add(k); else next.delete(k)
  }
  return next
}

// 勾选三态（v0.7.4 决定六）：父级状态一律由子树推出，勾选框不再直接读 selected.has(key)。
// 叶子键没有后代，判据回落到键自身。
export function selectionState(selected: Set<string>, allKeys: string[], key: string): 'none' | 'partial' | 'all' {
  const scope = scopeKeys(allKeys, key)
  const hit = scope.reduce((n, k) => n + (selected.has(k) ? 1 : 0), 0)
  return hit === 0 ? 'none' : hit === scope.length ? 'all' : 'partial'
}

// 词性窗格统计：只数直属中/英释义（例句/变形/近义词等不混算，spec §6）
export function countZhEn(node: FlatNode): { cn: number; en: number } {
  let cn = 0, en = 0
  for (const c of node.children) {
    if (c.field.key === 'chinese_definition') cn++
    else if (c.field.key === 'english_definition') en++
  }
  return { cn, en }
}

// 整棵字段树累计中+英释义总数（词典徽章口径）
export function countAllDefinitions(fields: DictionaryField[]): { cn: number; en: number } {
  let cn = 0, en = 0
  const walk = (ns: DictionaryField[]) => {
    for (const n of ns) {
      if (n.key === 'chinese_definition') cn++
      else if (n.key === 'english_definition') en++
      if (n.children?.length) walk(n.children)
    }
  }
  walk(fields ?? [])
  return { cn, en }
}
