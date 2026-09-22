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
})
