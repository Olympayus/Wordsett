import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getDb } from '../db/connection'
import * as wordsDb from '../db/words'
import * as fieldsDb from '../db/fields'
import { createTestDb, type DbLike } from '../db/test-utils'
import { getBacklinks, getLinkStats } from './linkService'

vi.mock('../db/connection', () => ({
  getDb: vi.fn(),
  initDatabase: vi.fn(),
}))

// v0.7.5 任务 7 起改为每例独立 DB：`getLinkStats` 是**全库**扫描，共享一张表会让它
// 把前面用例种下的链接一起数进来（同 categoryService.test.ts 的 beforeEach 模式）。
let adapter: DbLike
beforeEach(async () => {
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

async function addChildValue(wordId: string, fieldId: string, value: string, parentId: string): Promise<void> {
  const r = await fieldsDb.insertFieldValue({ wordId, fieldId, value, source: 'ecdict', parentId })
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

  it('辨析组与其子项印组描述（rowTitle 规则），两个不同的组不会聚成一行 ×N', async () => {
    const w = await addWord('abandon')
    // 两条不同描述的辨析组，各有一个子项引用同一目标。
    const groupA = await fieldsDb.insertFieldValue({
      wordId: w, fieldId: 'f_synonym_discrimination_group', value: '语域差异（正式 vs 口语）', source: 'user',
    })
    const groupB = await fieldsDb.insertFieldValue({
      wordId: w, fieldId: 'f_synonym_discrimination_group', value: '搭配差异（abandon oneself to）', source: 'user',
    })
    if (!groupA.ok || !groupB.ok) throw new Error('group insert failed')
    await addChildValue(w, 'f_synonym_discrimination_item', '[[forsake]] 偏书面', groupA.data.id)
    await addChildValue(w, 'f_synonym_discrimination_item', '[[forsake]] 可接反身代词', groupB.data.id)

    expect(await getBacklinks('forsake')).toEqual([
      { sourceWordId: w, sourceLemma: 'abandon', fieldName: '语域差异（正式 vs 口语）', count: 1 },
      { sourceWordId: w, sourceLemma: 'abandon', fieldName: '搭配差异（abandon oneself to）', count: 1 },
    ])
  })

  it('组描述里的链接标记在字段名上剥掉（与 rowTitle 一致）', async () => {
    const w = await addWord('abandon')
    await addValue(w, 'f_synonym_discrimination_group', '[[forsake]] 与 abandon 的差异')

    expect(await getBacklinks('forsake')).toEqual([
      { sourceWordId: w, sourceLemma: 'abandon', fieldName: 'forsake 与 abandon 的差异', count: 1 },
    ])
  })

  it('结构字段（词根 / 词根项）里的标记不进反链、不计入统计', async () => {
    const w = await addWord('abandon')
    await addValue(w, 'f_word_root', '[[forsake]] 同源')
    await addValue(w, 'f_word_root_item', '{{forsake}}')
    await addValue(w, 'f_chinese_definition', '放弃')

    expect(await getBacklinks('forsake')).toEqual([])
    expect(await getLinkStats()).toEqual({
      dict: { wordCount: 0, linkCount: 0, rows: [] },
      library: { wordCount: 0, linkCount: 0, rows: [] },
    })
  })
})

describe('getLinkStats 全库链接统计（v0.7.5 任务 7）', () => {
  it('两种标记分别统计源词数与出现次数；行按次数降序、词面升序', async () => {
    // dict：abandon 2 条（大小写各一也算两条）、desert 1、forsaken 1
    // library：forsake 2 条（跨字段合并成一行）、abandon 1、forsaken 1
    // idle 只有空目标与无链接正文：不产生任何行
    const abandon = await addWord('abandon')
    const desert = await addWord('desert')
    const forsake = await addWord('forsake')
    const forsaken = await addWord('forsaken')
    const idle = await addWord('idle')

    await addValue(abandon, 'f_chinese_definition', '{{apple}} 与 {{APPLE}}')
    await addValue(abandon, 'f_supplementary', '[[beta]]')
    await addValue(desert, 'f_chinese_definition', '{{pear}}')
    await addValue(forsake, 'f_chinese_definition', '[[alpha]]')
    await addValue(forsake, 'f_supplementary', '[[beta]]')
    await addValue(forsaken, 'f_chinese_definition', '[[alpha]] 与 {{grape}}')
    await addValue(forsaken, 'f_supplementary', '见 [[unclosed')
    await addValue(idle, 'f_chinese_definition', '[[]] 与 {{ }}')

    expect(await getLinkStats()).toEqual({
      dict: {
        wordCount: 3,
        linkCount: 4,
        rows: [
          { wordId: abandon, lemma: 'abandon', count: 2 },
          { wordId: desert, lemma: 'desert', count: 1 },
          { wordId: forsaken, lemma: 'forsaken', count: 1 },
        ],
      },
      library: {
        wordCount: 3,
        linkCount: 4,
        rows: [
          { wordId: forsake, lemma: 'forsake', count: 2 },
          { wordId: abandon, lemma: 'abandon', count: 1 },
          { wordId: forsaken, lemma: 'forsaken', count: 1 },
        ],
      },
    })
  })

  it('全库没有链接时两个口径都是零', async () => {
    const w = await addWord('empty')
    await addValue(w, 'f_chinese_definition', '普通释义，没有标记')

    expect(await getLinkStats()).toEqual({
      dict: { wordCount: 0, linkCount: 0, rows: [] },
      library: { wordCount: 0, linkCount: 0, rows: [] },
    })
  })
})
