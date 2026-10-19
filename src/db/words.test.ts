import { describe, it, expect, vi, beforeAll } from 'vitest'
import { getDb } from './connection'
import * as wordsDb from './words'
import * as fieldsDb from './fields'
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

describe('db/words', () => {
  it('createWord 创建并归一化 lemma', async () => {
    const r = await wordsDb.createWord({ lemma: '  Apple ' })
    if (!r.ok) throw new Error('createWord failed')
    expect(r.data.normalizedLemma).toBe('apple')
  })

  it('getWordsWithPreviews 聚合全部词性标签（按 displayOrder 序去重）', async () => {
    const wordResult = await wordsDb.createWord({ lemma: 'run' })
    if (!wordResult.ok) throw new Error('createWord failed')
    const word = wordResult.data
    await fieldsDb.insertFieldValue({ wordId: word.id, fieldId: 'f_part_of_speech', value: 'v.', source: 'ecdict', displayOrder: 0 })
    await fieldsDb.insertFieldValue({ wordId: word.id, fieldId: 'f_part_of_speech', value: 'n.', source: 'ecdict', displayOrder: 1 })
    const r = await wordsDb.getWordsWithPreviews()
    if (!r.ok) throw new Error('getWordsWithPreviews failed')
    const w = r.data.find(x => x.id === word.id)!
    expect(w.partOfSpeechTags).toEqual(['v.', 'n.'])
  })

  it('searchWords 按 lemma 过滤', async () => {
    await wordsDb.createWord({ lemma: 'perseverance' })
    await wordsDb.createWord({ lemma: 'patience' })
    const hit = await wordsDb.searchWords('sever')
    if (!hit.ok) throw new Error('searchWords failed')
    expect(hit.data.some(w => w.lemma === 'perseverance')).toBe(true)
    expect(hit.data.some(w => w.lemma === 'patience')).toBe(false)
  })

  it('searchWords 不因非展示字段命中而返回词条（第 9 条：收窄到 lemma + 音标 + 词性）', async () => {
    // 词根是非展示字段（侧栏行上不渲染），它的值不应参与筛选
    const hidden = await wordsDb.createWord({ lemma: 'zorblat' })
    if (!hidden.ok) throw new Error('createWord failed')
    await fieldsDb.insertFieldValue({
      wordId: hidden.data.id, fieldId: 'f_word_root', value: '苹果', source: 'user',
    })
    const byHiddenField = await wordsDb.searchWords('苹果')
    if (!byHiddenField.ok) throw new Error('searchWords failed')
    expect(byHiddenField.data.some(w => w.lemma === 'zorblat')).toBe(false)

    // 音标与词性是展示字段，它们的值仍应参与筛选
    const visible = await wordsDb.createWord({ lemma: 'zorbvat' })
    if (!visible.ok) throw new Error('createWord failed')
    await fieldsDb.insertFieldValue({
      wordId: visible.data.id, fieldId: 'f_phonetic', value: 'pingguo', source: 'user',
    })
    await fieldsDb.insertFieldValue({
      wordId: visible.data.id, fieldId: 'f_part_of_speech', value: 'qiguo', source: 'user',
    })
    const byPhonetic = await wordsDb.searchWords('pingguo')
    if (!byPhonetic.ok) throw new Error('searchWords failed')
    expect(byPhonetic.data.some(w => w.lemma === 'zorbvat')).toBe(true)
    const byPos = await wordsDb.searchWords('qiguo')
    if (!byPos.ok) throw new Error('searchWords failed')
    expect(byPos.data.some(w => w.lemma === 'zorbvat')).toBe(true)
  })

  it('deleteWord 删除单词及其字段（级联）', async () => {
    const wordResult = await wordsDb.createWord({ lemma: 'temp' })
    if (!wordResult.ok) throw new Error('createWord failed')
    const word = wordResult.data
    await fieldsDb.insertFieldValue({ wordId: word.id, fieldId: 'f_phonetic', value: '/temp/', source: 'ecdict' })
    await wordsDb.deleteWord(word.id)
    const all = await wordsDb.getAllWords()
    if (!all.ok) throw new Error('getAllWords failed')
    expect(all.data.some(w => w.id === word.id)).toBe(false)
    const vals = await fieldsDb.getFieldValuesForWord(word.id)
    if (!vals.ok) throw new Error('getFieldValuesForWord failed')
    expect(vals.data.length).toBe(0)
  })

  it('getWordsWithPreviews 聚合音标', async () => {
    const w = await wordsDb.createWord({ lemma: 'observe' })
    if (!w.ok) throw new Error('createWord failed')
    await fieldsDb.insertFieldValue({ wordId: w.data.id, fieldId: 'f_phonetic', value: '/əbˈzɜːv/', source: 'ecdict' })
    const r = await wordsDb.getWordsWithPreviews()
    if (!r.ok) throw new Error('getWordsWithPreviews failed')
    const p = r.data.find(x => x.id === w.data.id)!
    expect(p.phonetic).toBe('/əbˈzɜːv/')
  })

  it('getWordsByLocation：工作区与储藏库互不串台，旧入口只出工作区', async () => {    const ws = await wordsDb.createWord({ lemma: 'zonews' })
    const ar = await wordsDb.createWord({ lemma: 'zonear' })
    if (!ws.ok || !ar.ok) throw new Error('createWord failed')
    expect(ws.data.location).toBe('workspace')

    const moved = await wordsDb.setWordLocation(ar.data.id, 'archive')
    expect(moved.ok).toBe(true)

    const workspace = await wordsDb.getWordsByLocation('workspace')
    if (!workspace.ok) throw new Error('getWordsByLocation failed')
    const archive = await wordsDb.getWordsByLocation('archive')
    if (!archive.ok) throw new Error('getWordsByLocation failed')
    expect(workspace.data.some(w => w.id === ws.data.id)).toBe(true)
    expect(workspace.data.some(w => w.id === ar.data.id)).toBe(false)
    expect(archive.data.some(w => w.id === ar.data.id)).toBe(true)
    expect(archive.data.some(w => w.id === ws.data.id)).toBe(false)
    expect(archive.data.every(w => w.location === 'archive')).toBe(true)

    // 老入口保留为「工作区」别名：既有调用点不改语义。
    const legacy = await wordsDb.getWordsWithPreviews()
    if (!legacy.ok) throw new Error('getWordsWithPreviews failed')
    expect(legacy.data.some(w => w.id === ar.data.id)).toBe(false)
    expect(legacy.data.find(w => w.id === ws.data.id)?.location).toBe('workspace')

    // v0.7.5 Task 14：全库预览（批量管理候选集 / 分模块读数的位置来源）两个模块都在。
    const union = await wordsDb.getAllWordsWithPreviews()
    if (!union.ok) throw new Error('getAllWordsWithPreviews failed')
    expect(union.data.find(w => w.id === ws.data.id)?.location).toBe('workspace')
    expect(union.data.find(w => w.id === ar.data.id)?.location).toBe('archive')

    // 单行读取处也要带 location（Word / WordWithPreview 都带）。
    const all = await wordsDb.getAllWords()
    if (!all.ok) throw new Error('getAllWords failed')
    expect(all.data.find(w => w.id === ar.data.id)?.location).toBe('archive')
    const byLemma = await wordsDb.getWordByLemma('zonear')
    if (!byLemma.ok || !byLemma.data) throw new Error('getWordByLemma failed')
    expect(byLemma.data.location).toBe('archive')
  })

  it('getLocationCounts 三档数字正确', async () => {
    const before = await wordsDb.getLocationCounts()
    if (!before.ok) throw new Error('getLocationCounts failed')

    const ws = await wordsDb.createWord({ lemma: 'countws' })
    const ar = await wordsDb.createWord({ lemma: 'countar' })
    if (!ws.ok || !ar.ok) throw new Error('createWord failed')
    await wordsDb.setWordLocation(ar.data.id, 'archive')

    const after = await wordsDb.getLocationCounts()
    if (!after.ok) throw new Error('getLocationCounts failed')
    expect(after.data.total).toBe(before.data.total + 2)
    expect(after.data.workspace).toBe(before.data.workspace + 1)
    expect(after.data.archive).toBe(before.data.archive + 1)
    expect(after.data.total).toBe(after.data.workspace + after.data.archive)
  })

  it('getLemmaLocations 返回全库每词的归一化词面与模块', async () => {
    const ws = await wordsDb.createWord({ lemma: 'IndexWS' })
    const ar = await wordsDb.createWord({ lemma: 'IndexAR' })
    if (!ws.ok || !ar.ok) throw new Error('createWord failed')
    await wordsDb.setWordLocation(ar.data.id, 'archive')

    const r = await wordsDb.getLemmaLocations()
    if (!r.ok) throw new Error('getLemmaLocations failed')
    expect(r.data).toContainEqual({ normalizedLemma: 'indexws', location: 'workspace' })
    expect(r.data).toContainEqual({ normalizedLemma: 'indexar', location: 'archive' })
  })
})
