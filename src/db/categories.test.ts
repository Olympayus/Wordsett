import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getDb } from './connection'
import { createTestDb, type DbLike } from './test-utils'
import { createWord } from './words'
import * as categoriesDb from './categories'

vi.mock('./connection', () => ({
  getDb: vi.fn(),
  initDatabase: vi.fn(),
}))

let adapter: DbLike
beforeEach(async () => {
  adapter = await createTestDb()
  vi.mocked(getDb).mockReturnValue(adapter as unknown as ReturnType<typeof getDb>)
})

describe('categories db 层', () => {
  it('createCategory 创建分类，isDefault 默认 false', async () => {
    const r = await categoriesDb.createCategory({ name: '医学英语', color: '#6B8E7F' })
    if (!r.ok) throw new Error('createCategory failed')
    expect(r.data.id).toBeTruthy()
    expect(r.data.name).toBe('医学英语')
    expect(r.data.color).toBe('#6B8E7F')
    expect(r.data.isDefault).toBe(false)
  })

  it('getAllCategories 返回全部分类（按创建顺序）', async () => {
    await categoriesDb.createCategory({ name: 'A', color: '#7A7368' })
    await categoriesDb.createCategory({ name: 'B', color: '#4A6FA5' })
    const r = await categoriesDb.getAllCategories()
    if (!r.ok) throw new Error('getAllCategories failed')
    expect(r.data.map(c => c.name)).toEqual(['A', 'B'])
  })

  it('assignCategoryToWord + getCategoriesForWord 返回该单词分类', async () => {
    const w = await createWord({ lemma: 'observe' })
    if (!w.ok) throw new Error('createWord failed')
    const cat = await categoriesDb.createCategory({ name: '生物', color: '#6B8E7F' })
    if (!cat.ok) throw new Error('createCategory failed')
    await categoriesDb.assignCategoryToWord(w.data.id, cat.data.id)
    const r = await categoriesDb.getCategoriesForWord(w.data.id)
    if (!r.ok) throw new Error('getCategoriesForWord failed')
    expect(r.data.map(c => c.id)).toEqual([cat.data.id])
  })

  it('setDefault：设新默认清除旧默认（仅一个默认）', async () => {
    const a = await categoriesDb.createCategory({ name: 'A', color: '#7A7368' })
    const b = await categoriesDb.createCategory({ name: 'B', color: '#4A6FA5' })
    if (!a.ok || !b.ok) throw new Error('createCategory failed')
    await categoriesDb.updateCategory(a.data.id, { isDefault: true })
    await categoriesDb.updateCategory(b.data.id, { isDefault: true })
    const d = await categoriesDb.getDefaultCategory()
    if (!d.ok) throw new Error('getDefaultCategory failed')
    expect(d.data?.id).toBe(b.data.id)
  })

  it('deleteCategory 解除所有单词关联但保留单词', async () => {
    const w = await createWord({ lemma: 'delete-cat' })
    if (!w.ok) throw new Error('createWord failed')
    const cat = await categoriesDb.createCategory({ name: '待删', color: '#B85450' })
    if (!cat.ok) throw new Error('createCategory failed')
    await categoriesDb.assignCategoryToWord(w.data.id, cat.data.id)
    await categoriesDb.deleteCategory(cat.data.id)
    const cats = await categoriesDb.getCategoriesForWord(w.data.id)
    if (!cats.ok) throw new Error('getCategoriesForWord failed')
    expect(cats.data).toHaveLength(0)
    const words = await adapter.select<{ id: string }[]>(
      'SELECT id FROM words WHERE id = ?1', [w.data.id]
    )
    expect(words.length).toBe(1)
  })

  it('updateCategory 重命名/换色/清空描述', async () => {
    const cat = await categoriesDb.createCategory({ name: '旧名', color: '#7A7368', description: 'desc' })
    if (!cat.ok) throw new Error('createCategory failed')
    await categoriesDb.updateCategory(cat.data.id, { name: '新名', color: '#8B6A8B', description: null })
    const r = await categoriesDb.getAllCategories()
    if (!r.ok) throw new Error('getAllCategories failed')
    const updated = r.data.find(c => c.id === cat.data.id)!
    expect(updated.name).toBe('新名')
    expect(updated.color).toBe('#8B6A8B')
    expect(updated.description).toBeUndefined()
  })

  it('assignCategoryToWord 幂等：重复赋分类不产生重复行', async () => {
    const w = await createWord({ lemma: 'idem' })
    if (!w.ok) throw new Error('createWord failed')
    const cat = await categoriesDb.createCategory({ name: '幂等', color: '#5A7A8C' })
    if (!cat.ok) throw new Error('createCategory failed')
    await categoriesDb.assignCategoryToWord(w.data.id, cat.data.id)
    await categoriesDb.assignCategoryToWord(w.data.id, cat.data.id)
    const r = await categoriesDb.getCategoriesForWord(w.data.id)
    if (!r.ok) throw new Error('getCategoriesForWord failed')
    expect(r.data).toHaveLength(1)
  })

  it('getAllWordCategoryMap 返回 word_id → category_ids 映射（含多分类）', async () => {
    const w1 = await createWord({ lemma: 'observe' })
    const w2 = await createWord({ lemma: 'apple' })
    if (!w1.ok || !w2.ok) throw new Error('createWord failed')
    const c1 = await categoriesDb.createCategory({ name: '医学', color: '#6B8E7F' })
    const c2 = await categoriesDb.createCategory({ name: 'GRE', color: '#4A6FA5' })
    if (!c1.ok || !c2.ok) throw new Error('createCategory failed')
    await categoriesDb.assignCategoryToWord(w1.data.id, c1.data.id)
    await categoriesDb.assignCategoryToWord(w1.data.id, c2.data.id)
    await categoriesDb.assignCategoryToWord(w2.data.id, c1.data.id)
    const r = await categoriesDb.getAllWordCategoryMap()
    if (!r.ok) throw new Error('getAllWordCategoryMap failed')
    expect(r.data[w1.data.id].sort()).toEqual([c1.data.id, c2.data.id].sort())
    expect(r.data[w2.data.id]).toEqual([c1.data.id])
    expect(r.data['no-such-word']).toBeUndefined()
  })

  it('unassignCategoryFromWord 解除单词分类关联', async () => {
    const w = await createWord({ lemma: 'unassign-db' })
    if (!w.ok) throw new Error('createWord failed')
    const cat = await categoriesDb.createCategory({ name: '解绑', color: '#8B6A8B' })
    if (!cat.ok) throw new Error('createCategory failed')
    await categoriesDb.assignCategoryToWord(w.data.id, cat.data.id)
    const assigned = await categoriesDb.getCategoriesForWord(w.data.id)
    if (!assigned.ok) throw new Error('getCategoriesForWord failed')
    expect(assigned.data).toHaveLength(1)
    const un = await categoriesDb.unassignCategoryFromWord(w.data.id, cat.data.id)
    expect(un.ok).toBe(true)
    const after = await categoriesDb.getCategoriesForWord(w.data.id)
    if (!after.ok) throw new Error('getCategoriesForWord failed')
    expect(after.data).toHaveLength(0)
  })

  it('assignCategoryToWords 批量归类：幂等，重复调用不插重复行', async () => {
    const cat = await categoriesDb.createCategory({ name: '批', color: '#4A6FA5' })
    if (!cat.ok) throw new Error('createCategory failed')
    const a = await createWord({ lemma: 'bulk-1' })
    const b = await createWord({ lemma: 'bulk-2' })
    const c = await createWord({ lemma: 'bulk-3' })
    if (!a.ok || !b.ok || !c.ok) throw new Error('createWord failed')

    await categoriesDb.assignCategoryToWords([a.data.id, b.data.id, c.data.id], cat.data.id)
    await categoriesDb.assignCategoryToWords([a.data.id, b.data.id], cat.data.id)

    const rows = await adapter.select<{ c: number }>(
      'SELECT count(*) as c FROM word_categories WHERE category_id = ?1', [cat.data.id])
    expect(rows[0].c).toBe(3)
  })

  it('unassignCategoryFromWords 只影响目标分类，其他分类的关联保留', async () => {
    const c1 = await categoriesDb.createCategory({ name: '甲', color: '#4A6FA5' })
    const c2 = await categoriesDb.createCategory({ name: '乙', color: '#C17A4E' })
    if (!c1.ok || !c2.ok) throw new Error('createCategory failed')
    const a = await createWord({ lemma: 'bulk-4' })
    const b = await createWord({ lemma: 'bulk-5' })
    if (!a.ok || !b.ok) throw new Error('createWord failed')
    await categoriesDb.assignCategoryToWords([a.data.id, b.data.id], c1.data.id)
    await categoriesDb.assignCategoryToWords([a.data.id, b.data.id], c2.data.id)

    await categoriesDb.unassignCategoryFromWords([a.data.id], c1.data.id)

    const inC1 = await adapter.select<{ c: number }>(
      'SELECT count(*) as c FROM word_categories WHERE category_id = ?1', [c1.data.id])
    const inC2 = await adapter.select<{ c: number }>(
      'SELECT count(*) as c FROM word_categories WHERE category_id = ?1', [c2.data.id])
    expect(inC1[0].c).toBe(1)
    expect(inC2[0].c).toBe(2)
  })

  it('批量超过 200 个词时分批执行，不撞 SQLite 变量上限', async () => {
    const cat = await categoriesDb.createCategory({ name: '多', color: '#6B8E7F' })
    if (!cat.ok) throw new Error('createCategory failed')
    const ids: string[] = []
    for (let i = 0; i < 250; i++) {
      const w = await createWord({ lemma: `bulk-many-${i}` })
      if (!w.ok) throw new Error('createWord failed')
      ids.push(w.data.id)
    }

    await categoriesDb.assignCategoryToWords(ids, cat.data.id)

    const rows = await adapter.select<{ c: number }>(
      'SELECT count(*) as c FROM word_categories WHERE category_id = ?1', [cat.data.id])
    expect(rows[0].c).toBe(250)
  })
})
