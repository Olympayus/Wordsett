import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getDb } from '../db/connection'
import { createTestDb, type DbLike } from '../db/test-utils'
import * as categoriesDb from '../db/categories'
import * as wordsDb from '../db/words'
import * as categoryService from './categoryService'
import * as wordService from './wordService'

vi.mock('../db/connection', () => ({
  getDb: vi.fn(),
  initDatabase: vi.fn(),
}))

// 每例独立 DB：避免默认分类/单词跨用例泄漏（同 Task 2 categories.test.ts 模式）
let adapter: DbLike
beforeEach(async () => {
  adapter = await createTestDb()
  vi.mocked(getDb).mockReturnValue(adapter as unknown as ReturnType<typeof getDb>)
})

describe('categoryService 默认分类自动归入', () => {
  it('addWord 新建单词自动归入默认分类', async () => {
    const cat = await categoriesDb.createCategory({ name: '默认', color: '#6B8E7F', isDefault: true })
    if (!cat.ok) throw new Error('createCategory failed')
    const word = await wordService.addWord('default-cat-word')
    expect(word).not.toBeNull()
    const cats = await categoryService.getWordCategories(word!.id)
    expect(cats.map(c => c.id)).toContain(cat.data.id)
  })

  it('无默认分类时 addWord 不报错、无分类', async () => {
    const word = await wordService.addWord('no-default-word')
    expect(word).not.toBeNull()
    const cats = await categoryService.getWordCategories(word!.id)
    expect(cats).toHaveLength(0)
  })

  it('单词已存在时 addWord 不再重复归入', async () => {
    const cat = await categoriesDb.createCategory({ name: '默认2', color: '#4A6FA5', isDefault: true })
    if (!cat.ok) throw new Error('createCategory failed')
    const w1 = await wordService.addWord('again-word')
    await wordService.addWord('again-word')  // 已存在：走 existing 早退
    const cats = await categoryService.getWordCategories(w1!.id)
    expect(cats.filter(c => c.id === cat.data.id)).toHaveLength(1)
  })
})

describe('categoryService 分类 CRUD 包装', () => {
  it('createCategory + getCategories 往返', async () => {
    const created = await categoryService.createCategory({ name: '文学', color: '#8B7355' })
    expect(created).not.toBeNull()
    const all = await categoryService.getCategories()
    expect(all.some(c => c.id === created!.id)).toBe(true)
  })

  it('updateCategory 更新名称', async () => {
    const cat = await categoriesDb.createCategory({ name: '旧名', color: '#4A6FA5' })
    if (!cat.ok) throw new Error('createCategory failed')
    const updated = await categoryService.updateCategory(cat.data.id, { name: '新名' })
    expect(updated?.name).toBe('新名')
  })

  it('deleteCategory 删除分类', async () => {
    const cat = await categoriesDb.createCategory({ name: '待删', color: '#B85450' })
    if (!cat.ok) throw new Error('createCategory failed')
    expect(await categoryService.deleteCategory(cat.data.id)).toBe(true)
  })

  it('assignCategoryToWord / unassignCategoryFromWord 包装', async () => {
    const cat = await categoriesDb.createCategory({ name: '医学', color: '#6B8E7F' })
    if (!cat.ok) throw new Error('createCategory failed')
    const w = await wordsDb.createWord({ lemma: 'svc-assign' })
    if (!w.ok) throw new Error('createWord failed')
    expect(await categoryService.assignCategoryToWord(w.data.id, cat.data.id)).toBe(true)
    expect((await categoryService.getWordCategories(w.data.id)).some(c => c.id === cat.data.id)).toBe(true)
    expect(await categoryService.unassignCategoryFromWord(w.data.id, cat.data.id)).toBe(true)
    expect((await categoryService.getWordCategories(w.data.id)).some(c => c.id === cat.data.id)).toBe(false)
  })

  it('getWordCategoryMap 返回 word_id → 分类 id 列表', async () => {
    const cat = await categoriesDb.createCategory({ name: '映射', color: '#5A7A8C' })
    if (!cat.ok) throw new Error('createCategory failed')
    const w = await wordsDb.createWord({ lemma: 'svc-map' })
    if (!w.ok) throw new Error('createWord failed')
    await categoryService.assignCategoryToWord(w.data.id, cat.data.id)
    const map = await categoryService.getWordCategoryMap()
    expect(map[w.data.id]).toContain(cat.data.id)
  })

  // v0.7.5 Task 12：自由练习的分类计数传 'workspace'，储藏库词不能计入「N 词」。
  it('getWordCategoryMap(location) 只带出该模块的词', async () => {
    const cat = await categoriesDb.createCategory({ name: '分模块', color: '#5A7A8C' })
    if (!cat.ok) throw new Error('createCategory failed')
    const ws = await wordsDb.createWord({ lemma: 'svc-map-workspace' })
    const ar = await wordsDb.createWord({ lemma: 'svc-map-archive' })
    if (!ws.ok || !ar.ok) throw new Error('createWord failed')
    await categoryService.assignCategoryToWord(ws.data.id, cat.data.id)
    await categoryService.assignCategoryToWord(ar.data.id, cat.data.id)
    await adapter.execute("UPDATE words SET location = 'archive' WHERE id = ?1", [ar.data.id])

    const map = await categoryService.getWordCategoryMap('workspace')
    expect(Object.keys(map)).toEqual([ws.data.id])
  })

  // v0.7.5 Task 14：分类管理要按模块分读数，缺省（不传 location）必须仍读全库两个模块，
  // 否则储藏库的成员会从分类行上消失。
  it('getWordCategoryMap() 缺省时合并工作区与储藏库（分类管理读全库）', async () => {
    const cat = await categoriesDb.createCategory({ name: '并集', color: '#5A7A8C' })
    if (!cat.ok) throw new Error('createCategory failed')
    const ws = await wordsDb.createWord({ lemma: 'svc-union-workspace' })
    const ar = await wordsDb.createWord({ lemma: 'svc-union-archive' })
    if (!ws.ok || !ar.ok) throw new Error('createWord failed')
    await categoryService.assignCategoryToWord(ws.data.id, cat.data.id)
    await categoryService.assignCategoryToWord(ar.data.id, cat.data.id)
    await adapter.execute("UPDATE words SET location = 'archive' WHERE id = ?1", [ar.data.id])

    const map = await categoryService.getWordCategoryMap()
    expect(map[ws.data.id]).toEqual([cat.data.id])
    expect(map[ar.data.id]).toEqual([cat.data.id])
  })
})
