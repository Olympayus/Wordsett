import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getCachedDbMock } = vi.hoisted(() => ({ getCachedDbMock: vi.fn() }))
vi.mock('./dbCache', () => ({ getCachedDb: getCachedDbMock }))
vi.mock('./dictPath', () => ({
  resolveDictPath: vi.fn(async () => 'test.db'),
  toSqliteUrl: vi.fn((p: string) => `sqlite:${p}`),
}))

import { EcdictProvider } from './ecdict'

describe('EcdictProvider.searchLemmas', () => {
  const select = vi.fn()
  beforeEach(() => {
    select.mockReset()
    getCachedDbMock.mockResolvedValue({ select })
  })

  it('建议查询带 EXISTS 过滤：只返回 entries 中存在的词（排除 lemma.json 里的孤儿词）', async () => {
    select.mockResolvedValue([{ word: 'apple' }, { word: 'applejacks' }])
    const results = await new EcdictProvider().searchLemmas('apple')
    expect(results).toEqual(['apple', 'applejacks'])
    const [sql] = select.mock.calls[0]
    expect(sql).toContain('EXISTS (SELECT 1 FROM entries WHERE entries.word = lemmas.word)')
    expect(sql).toContain('ORDER BY frequency DESC')
    expect(sql).toContain('LIMIT 50')
  })

  it('空查询直接返回空数组，不访问数据库', async () => {
    await expect(new EcdictProvider().searchLemmas('   ')).resolves.toEqual([])
    expect(select).not.toHaveBeenCalled()
  })
})

describe('EcdictProvider.searchByChinese', () => {
  const select = vi.fn()
  beforeEach(() => {
    select.mockReset()
    getCachedDbMock.mockResolvedValue({ select })
  })

  it('中文搜索：多取词频列、按常用度预排序、LIMIT 300（v0.4.4）', async () => {
    select.mockResolvedValue([{ word: 'interesting', translation: 'a. 有趣的', collins: 3, frq: 1072 }])
    const results = await new EcdictProvider().searchByChinese('有趣的')
    expect(results).toEqual([{ word: 'interesting', translation: 'a. 有趣的', collins: 3, frq: 1072 }])
    const [sql, params] = select.mock.calls[0]
    expect(sql).toContain('collins')
    expect(sql).toContain('frq')
    expect(sql).toContain('ORDER BY collins DESC, frq ASC')
    expect(sql).toContain('LIMIT 300')
    expect(sql).toContain('WHERE translation LIKE ?1')
    expect(params).toEqual(['%有趣的%'])
  })
})
