import { describe, it, expect, vi, beforeAll } from 'vitest'
import { getDb } from './connection'
import * as fieldsDb from './fields'
import { deleteFieldValueCascade, getFieldValuesForWord, insertFieldValue } from './fields'
import { createWord } from './words'
import * as wordsDb from './words'
import { createTestDb, type DbLike } from './test-utils'

vi.mock('./connection', () => ({
  getDb: vi.fn(),
  initDatabase: vi.fn(),
}))

let adapter: DbLike
beforeAll(async () => {
  adapter = await createTestDb()
  vi.mocked(getDb).mockReturnValue(adapter as unknown as ReturnType<typeof getDb>)
})

describe('db/fields', () => {
  it('getFieldDefinitions 返回 22 个内置字段且按 display_order 排序', async () => {
    const r = await fieldsDb.getFieldDefinitions()
    if (!r.ok) throw new Error('getFieldDefinitions failed')
    expect(r.data.length).toBe(22)
    expect(r.data[0].key).toBe('chinese_definition')
  })

  it('insertFieldValue 插入父字段与子字段', async () => {
    const wResult = await createWord({ lemma: 'observe' })
    if (!wResult.ok) throw new Error('createWord failed')
    const w = wResult.data
    const parentResult = await fieldsDb.insertFieldValue({ wordId: w.id, fieldId: 'f_exchange', value: '', source: 'ecdict' })
    if (!parentResult.ok) throw new Error('insertFieldValue failed')
    const parent = parentResult.data
    const childResult = await fieldsDb.insertFieldValue({ wordId: w.id, fieldId: 'f_exchange_item', value: '过去式: observed', source: 'ecdict', parentId: parent.id })
    if (!childResult.ok) throw new Error('insertFieldValue failed')
    const child = childResult.data
    expect(child.parentId).toBe(parent.id)
    const children = await fieldsDb.getFieldValuesByParent(parent.id)
    if (!children.ok) throw new Error('getFieldValuesByParent failed')
    expect(children.data.length).toBe(1)
    expect(children.data[0].value).toBe('过去式: observed')
  })

  it('updateFieldValueById 更新值且保留 display_order 与 parent_id', async () => {
    const wResult = await createWord({ lemma: 'apple' })
    if (!wResult.ok) throw new Error('createWord failed')
    const w = wResult.data
    const parentResult = await fieldsDb.insertFieldValue({ wordId: w.id, fieldId: 'f_exchange', value: '', source: 'ecdict' })
    if (!parentResult.ok) throw new Error('insertFieldValue failed')
    const fvResult = await fieldsDb.insertFieldValue({ wordId: w.id, fieldId: 'f_exchange_item', value: '过去式: ate', source: 'ecdict', displayOrder: 5, parentId: parentResult.data.id })
    if (!fvResult.ok) throw new Error('insertFieldValue failed')
    const fv = fvResult.data
    const updated = await fieldsDb.updateFieldValueById(fv.id, { value: '过去式: eaten' })
    if (!updated.ok) throw new Error('updateFieldValueById failed')
    expect(updated.data.value).toBe('过去式: eaten')
    expect(updated.data.displayOrder).toBe(5)
    expect(updated.data.parentId).toBe(parentResult.data.id)
    const notFound = await fieldsDb.updateFieldValueById('nonexistent', { value: 'x' })
    expect(notFound.ok).toBe(false)
  })

  it('updateFieldValueById 置 edited 且保留原 source（不改成 user）', async () => {
    const wResult = await createWord({ lemma: 'source-keep' })
    if (!wResult.ok) throw new Error('createWord failed')
    const fvResult = await fieldsDb.insertFieldValue({ wordId: wResult.data.id, fieldId: 'f_chinese_definition', value: '苹果', source: 'ecdict' })
    if (!fvResult.ok) throw new Error('insertFieldValue failed')
    const updated = await fieldsDb.updateFieldValueById(fvResult.data.id, { value: '苹果（新）', edited: true, originalValue: '苹果' })
    if (!updated.ok) throw new Error('updateFieldValueById failed')
    expect(updated.data.value).toBe('苹果（新）')
    expect(updated.data.source).toBe('ecdict')
    expect(updated.data.edited).toBe(true)
    expect(updated.data.originalValue).toBe('苹果')
  })

  it('restoreFieldValue 还原原始值并清除 edited', async () => {
    const wResult = await createWord({ lemma: 'restore-test' })
    if (!wResult.ok) throw new Error('createWord failed')
    const fvResult = await fieldsDb.insertFieldValue({ wordId: wResult.data.id, fieldId: 'f_english_definition', value: 'original', source: 'wordnet' })
    if (!fvResult.ok) throw new Error('insertFieldValue failed')
    await fieldsDb.updateFieldValueById(fvResult.data.id, { value: 'changed', edited: true, originalValue: 'original' })
    const restored = await fieldsDb.restoreFieldValue(fvResult.data.id)
    if (!restored.ok) throw new Error('restoreFieldValue failed')
    expect(restored.data.value).toBe('original')
    expect(restored.data.edited).toBe(false)
    expect(restored.data.originalValue).toBeNull()
  })

  it('reorderFieldValues 更新 display_order', async () => {
    const wResult = await createWord({ lemma: 'reorder-test' })
    if (!wResult.ok) throw new Error('createWord failed')
    const a = await fieldsDb.insertFieldValue({ wordId: wResult.data.id, fieldId: 'f_phonetic', value: '/a/', source: 'ecdict', displayOrder: 0 })
    const b = await fieldsDb.insertFieldValue({ wordId: wResult.data.id, fieldId: 'f_phonetic', value: '/b/', source: 'ecdict', displayOrder: 1 })
    if (!a.ok || !b.ok) throw new Error('insertFieldValue failed')
    await fieldsDb.reorderFieldValues([{ id: b.data.id, displayOrder: 0 }, { id: a.data.id, displayOrder: 1 }])
    const vals = await fieldsDb.getFieldValuesForWord(wResult.data.id)
    if (!vals.ok) throw new Error('getFieldValuesForWord failed')
    expect(vals.data[0].id).toBe(b.data.id)
  })

  it('deleteFieldValue 删除字段', async () => {
    const wResult = await createWord({ lemma: 'banana' })
    if (!wResult.ok) throw new Error('createWord failed')
    const w = wResult.data
    const fvResult = await fieldsDb.insertFieldValue({ wordId: w.id, fieldId: 'f_phonetic', value: '/bə/', source: 'ecdict' })
    if (!fvResult.ok) throw new Error('insertFieldValue failed')
    const fv = fvResult.data
    await fieldsDb.deleteFieldValue(fv.id)
    const vals = await fieldsDb.getFieldValuesForWord(w.id)
    if (!vals.ok) throw new Error('getFieldValuesForWord failed')
    expect(vals.data.length).toBe(0)
  })

  it('插入的 field_value 返回 edited=false 且 originalValue=null', async () => {
    const wResult = await createWord({ lemma: 'edited-test' })
    if (!wResult.ok) throw new Error('createWord failed')
    const fvResult = await fieldsDb.insertFieldValue({ wordId: wResult.data.id, fieldId: 'f_phonetic', value: '/edit/', source: 'ecdict' })
    if (!fvResult.ok) throw new Error('insertFieldValue failed')
    expect(fvResult.data.edited).toBe(false)
    expect(fvResult.data.originalValue).toBeNull()
    const vals = await fieldsDb.getFieldValuesForWord(wResult.data.id)
    if (!vals.ok) throw new Error('getFieldValuesForWord failed')
    expect(vals.data[0].edited).toBe(false)
    expect(vals.data[0].originalValue).toBeNull()
  })

  it('restoreFieldValue 无 original_value 时返回失败', async () => {
    const wResult = await createWord({ lemma: 'no-orig' })
    if (!wResult.ok) throw new Error('createWord failed')
    const fvResult = await fieldsDb.insertFieldValue({ wordId: wResult.data.id, fieldId: 'f_phonetic', value: '/x/', source: 'ecdict' })
    if (!fvResult.ok) throw new Error('insertFieldValue failed')
    const res = await fieldsDb.restoreFieldValue(fvResult.data.id)
    expect(res.ok).toBe(false)
  })

  it('级联删除整棵子树（先子后父）', async () => {
    const w = await wordsDb.createWord({ lemma: 'cascade' })
    if (!w.ok) throw new Error('createWord failed')
    const parentResult = await insertFieldValue({ wordId: w.data.id, fieldId: 'f_part_of_speech', value: 'n.', source: 'ecdict' })
    if (!parentResult.ok) throw new Error('insertFieldValue failed')
    const parent = parentResult.data
    const childResult = await insertFieldValue({ wordId: w.data.id, fieldId: 'f_chinese_definition', value: '大气', source: 'ecdict', parentId: parent.id })
    if (!childResult.ok) throw new Error('insertFieldValue failed')
    const child = childResult.data
    await insertFieldValue({ wordId: w.data.id, fieldId: 'f_synonyms', value: '', source: 'ecdict', parentId: child.id })
    const r0 = await getFieldValuesForWord(w.data.id)
    if (!r0.ok) throw new Error('getFieldValuesForWord failed')
    expect(r0.data).toHaveLength(3)
    await deleteFieldValueCascade(parent.id)
    const r1 = await getFieldValuesForWord(w.data.id)
    if (!r1.ok) throw new Error('getFieldValuesForWord failed')
    expect(r1.data).toHaveLength(0)
  })
})
