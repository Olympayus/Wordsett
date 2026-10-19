import { describe, it, expect, vi, beforeAll } from 'vitest'
import { getDb } from '../db/connection'
import * as wordsDb from '../db/words'
import * as fieldsDb from '../db/fields'
import { createTestDb, type DbLike } from '../db/test-utils'
import { getBacklinks } from './linkService'

vi.mock('../db/connection', () => ({
  getDb: vi.fn(),
  initDatabase: vi.fn(),
}))

let adapter: DbLike
beforeAll(async () => {
  adapter = await createTestDb()
  vi.mocked(getDb).mockReturnValue(adapter as unknown as ReturnType<typeof getDb>)
})

async function addWord(lemma: string): Promise<string> {
  const w = await wordsDb.createWord({ lemma })
  if (!w.ok) throw new Error('createWord failed')
  return w.data.id
}

async function addValue(wordId: string, fieldId: string, value: string): Promise<void> {
  const r = await fieldsDb.insertFieldValue({ wordId, fieldId, value, source: 'ecdict' })
  if (!r.ok) throw new Error('insertFieldValue failed')
}

describe('getBacklinks 全库反链扫描', () => {
  it('返回指向目标的来源词与字段名，同格两次计 2、顺序按首次出现', async () => {
    const w1 = await addWord('abandon')
    const w2 = await addWord('desert')
    const w3 = await addWord('forsake')
    // 同一条 value 里两次 [[forsake]]：算两条（linkTargets 不去重，扫描按次 push）
    await addValue(w1, 'f_synonym_discrimination', '见 [[forsake]] 与 [[forsake]]')
    await addValue(w1, 'f_chinese_definition', '放弃，[[forsake]]')
    // 大小写不影响匹配（normalizeLinkTarget）
    await addValue(w2, 'f_synonym_discrimination', '[[FORSAKE]]')
    // 指向别的词：不是 forsake 的反链
    await addValue(w3, 'f_chinese_definition', '[[abandon]]')

    expect(await getBacklinks(' forsake ')).toEqual([
      { sourceWordId: w1, sourceLemma: 'abandon', fieldName: '近义词辨析', count: 2 },
      { sourceWordId: w1, sourceLemma: 'abandon', fieldName: '中文释义', count: 1 },
      { sourceWordId: w2, sourceLemma: 'desert', fieldName: '近义词辨析', count: 1 },
    ])
  })

  it('残缺标记与非目标目标不产生反链；{{ }} 按目标计入', async () => {
    const w = await addWord('forsaken')
    await addValue(w, 'f_chinese_definition', '[[forsaken]] 与 {{forsook}}')
    await addValue(w, 'f_supplementary', '见 [[forsook')

    expect(await getBacklinks('forsook')).toEqual([
      { sourceWordId: w, sourceLemma: 'forsaken', fieldName: '中文释义', count: 1 },
    ])
  })

  it('无来源返回空数组', async () => {
    expect(await getBacklinks('nonexistent')).toEqual([])
  })
})
