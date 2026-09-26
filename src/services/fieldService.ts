import * as fieldsDb from '../db/fields'
import type { FieldDefinition, FieldValue, UpsertFieldValueInput, FieldValueContentUpdate } from '../types/field'
import { sortTreeByTemplate } from '../lib/fieldOrder'

let defsCache: FieldDefinition[] | null = null

export async function getDefinitions(): Promise<FieldDefinition[]> {
  if (defsCache) return defsCache
  const result = await fieldsDb.getFieldDefinitions()
  if (result.ok) {
    defsCache = result.data
    return result.data
  }
  return []
}

export function clearDefinitionsCache() {
  defsCache = null
}

// Single insert (no dedup check)
export async function insertValue(input: UpsertFieldValueInput): Promise<FieldValue | null> {
  const result = await fieldsDb.insertFieldValue(input)
  return result.ok ? result.data : null
}

// addFieldValue 签名扩展：支持挂到父下
export async function addFieldValue(wordId: string, fieldId: string, parentId?: string | null): Promise<FieldValue | null> {
  return insertValue({ wordId, fieldId, value: '', source: 'user', parentId: parentId ?? null })
}

// 级联删除（编辑侧单节点删除）
export async function deleteValueCascade(id: string): Promise<boolean> {
  const result = await fieldsDb.deleteFieldValueCascade(id)
  return result.ok
}

// Batch insert multiple field values (used for dictionary imports)
export async function insertValues(inputs: UpsertFieldValueInput[]): Promise<FieldValue[]> {
  const results: FieldValue[] = []
  for (const input of inputs) {
    const result = await fieldsDb.insertFieldValue(input)
    if (result.ok && result.data) results.push(result.data)
  }
  return results
}

// Update an existing field_value row by its id (used by WordWorkbench user-edit flow).
// Precise by-id targeting fixes editing the 2nd+ value of a multi-value field.
export async function updateValueById(id: string, input: FieldValueContentUpdate): Promise<FieldValue | null> {
  const result = await fieldsDb.updateFieldValueById(id, input)
  return result.ok ? result.data : null
}

// Revert a field_value to its original value (clears edited state).
export async function restoreValue(id: string): Promise<FieldValue | null> {
  const result = await fieldsDb.restoreFieldValue(id)
  return result.ok ? result.data : null
}

// Rewrite display_order for the given field_value ids (drag-to-reorder flow).
export async function reorderValues(entries: { id: string; displayOrder: number }[]): Promise<boolean> {
  const result = await fieldsDb.reorderFieldValues(entries)
  return result.ok
}

export async function getValues(wordId: string): Promise<FieldValue[]> {
  const result = await fieldsDb.getFieldValuesForWord(wordId)
  if (!result.ok) return []

  // Build maps for tree aggregation
  const fvMap = new Map<string, FieldValue>()
  const childrenMap = new Map<string, FieldValue[]>()

  for (const fv of result.data) {
    fvMap.set(fv.id, { ...fv, children: [] })
    if (fv.parentId) {
      if (!childrenMap.has(fv.parentId)) childrenMap.set(fv.parentId, [])
      childrenMap.get(fv.parentId)!.push(fvMap.get(fv.id)!)
    }
  }

  // Attach children to parents
  for (const [parentId, children] of childrenMap) {
    const parent = fvMap.get(parentId)
    if (parent) parent.children = children
  }

  // Return root-level nodes (entries without a parentId)
  return result.data
    .filter(fv => !fv.parentId)
    .map(fv => ({ ...fv, children: childrenMap.get(fv.id) || [] }))
}

// 按模板位次重排整词 display_order（spec §4.1）：合并后调用。
// 返回 true 表示完成（无行时也是成功）。
export async function renumberWordByTemplate(wordId: string): Promise<boolean> {
  const result = await fieldsDb.getFieldValuesForWord(wordId)
  if (!result.ok || result.data.length === 0) return true
  const defs = await getDefinitions()
  const keyByDefId = new Map(defs.map(d => [d.id, d.key]))
  const keyOf = (fv: FieldValue) => keyByDefId.get(fv.fieldId) ?? fv.fieldId
  const values = await getValues(wordId)
  const sorted = sortTreeByTemplate(keyOf, values)
  const flat: { id: string; displayOrder: number }[] = []
  const assign = (nodes: FieldValue[]) => {
    for (const n of nodes) {
      flat.push({ id: n.id, displayOrder: flat.length })
      if (n.children?.length) assign(n.children)
    }
  }
  assign(sorted)
  return (await fieldsDb.reorderFieldValues(flat)).ok
}

/**
 * 取一个词的全部字段值，连同字段定义的 key（v0.6.2 条目 12）。
 *
 * 复习模块的「完整词条」要复刻工作台「词性」标签页的树，而树的分组依据是**字段 key**
 * （part_of_speech / chinese_definition / …），`FieldValue` 里只有 `fieldId`。
 * 故这里把 definitions 的 id→key 映射拼上。定义有缓存（getDefinitions），不自查库。
 *
 * 逐字段（而非整词）查词条内容，故不取缓存。这里返回**摊平**的行：`getValues` 只返回
 * 根节点、子级挂在 `children` 上，而 buildPosTree 要按 parentId 逐层走，须自己摊开——
 * 摊平到叶子（例句还要再往下两层），浅一层就漏。保留传入的 displayOrder，不改排序。
 */
export async function getValuesWithKeys(wordId: string): Promise<{
  id: string; key: string; value: string; parentId: string | null; displayOrder: number
}[]> {
  const [values, defs] = await Promise.all([getValues(wordId), getDefinitions()])
  const keyOf = new Map(defs.map(d => [d.id, d.key]))
  const flat: { id: string; key: string; value: string; parentId: string | null; displayOrder: number }[] = []
  const walk = (nodes: FieldValue[]) => {
    for (const n of nodes) {
      flat.push({
        id: n.id,
        key: keyOf.get(n.fieldId) ?? '',
        value: n.value,
        parentId: n.parentId,
        displayOrder: n.displayOrder,
      })
      if (n.children?.length) walk(n.children)
    }
  }
  walk(values)
  return flat.filter(v => v.key !== '')
}
