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

// ②a 判定：是否以无框平铺渲染子级。词性窗格永不平铺（保留词性→释义树与中/英释义编号）；
// 仅非词性容器且全部子级为终端项（无子级）时平铺。
export function shouldFlattenChildren(
  isPosPane: boolean,
  hasChildren: boolean,
  children: readonly unknown[],
): boolean {
  return !isPosPane && hasChildren && children.every(c => {
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

// 由勾选集构建 MergeFieldInput[]：父先子后，tempId=source:key，子引用父 tempId；
// 隐式补选已勾选节点的全部祖先（保证无游离释义不变量）。
export function buildMergeInputs(fields: DictionaryField[], selected: Set<string>, source: FieldSource): MergeFieldInput[] {
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
  const walk = (nodes: FlatNode[]) => {
    for (const n of nodes) {
      if (!effective.has(n.key)) continue
      out.push({
        key: n.field.key,
        value: n.field.value,
        source,
        tempId: `${source}:${n.key}`,
        ...(n.parentKey ? { parentTempId: `${source}:${n.parentKey}` } : {}),
      })
      walk(n.children)
    }
  }
  walk(flat)
  return out
}

// 词性/容器级整体勾选：未全选 → 补全子树；全选 → 清空子树（spec §4.5）
export function toggleSubtreeSelection(selected: Set<string>, allKeys: string[], key: string): Set<string> {
  const next = new Set(selected)
  const descendantKeys = allKeys.filter(k => k.startsWith(`${key}-`))
  const isOn = !descendantKeys.every(k => next.has(k))
  for (const k of [key, ...descendantKeys]) {
    if (isOn) next.add(k); else next.delete(k)
  }
  return next
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
