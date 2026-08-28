import { describe, it, expect, vi } from 'vitest'
import { fetchEcdictTitleMeta, fetchWordnetDomains } from './titleMeta'

// 按 SQL 内容路由：含 word_roots 的表查询走 roots，否则走 entry
const dbOf = (entry: unknown[], roots: unknown[] = []) => ({
  select: vi.fn(async (sql: string, _params?: unknown[]): Promise<any> => (sql.includes('word_roots') ? roots : entry)),
})

describe('fetchEcdictTitleMeta', () => {
  it('有词条时返回 phonetic + badges + wordRoots', async () => {
    const db = dbOf(
      [{ phonetic: "'hʊd", collins: 3, oxford: 1, tag: 'zk gk' }],
      [{ class: 'root', root: 'hom', meaning: 'man, human', origin: 'Latin' }],
    )
    const meta = await fetchEcdictTitleMeta(db, 'hood')
    expect(meta.phonetic).toBe("'hʊd")
    expect(meta.badges).toEqual({ collins: 3, oxford: 1, tag: 'zk gk' })
    expect(meta.wordRoots).toEqual([{ class: 'root', root: 'hom', meaning: 'man, human', origin: 'Latin' }])
    expect(db.select.mock.calls[1][0]).toContain('FROM word_roots')
    expect(db.select.mock.calls[1][1]).toEqual(['hood'])
  })

  it('无词条 / 全零词频 → phonetic null、badges null、wordRoots []', async () => {
    const db = dbOf([{}], [])
    const meta = await fetchEcdictTitleMeta(db, 'nope')
    expect(meta.phonetic).toBeNull()
    expect(meta.badges).toBeNull()
    expect(meta.wordRoots).toEqual([])
  })
})

describe('fetchWordnetDomains', () => {
  it('按 rel_type 路由到 categories/regions/usages，head word 映射中文并去重', async () => {
    const db = dbOf([
      { rel_type: ';c', words: 'biology\nbiologies' },
      { rel_type: ';c', words: 'biology' },
      { rel_type: ';r', words: 'United Kingdom' },
      { rel_type: ';u', words: 'trope' },
    ])
    const d = await fetchWordnetDomains(db, 'cell')
    expect(d.categories).toEqual(['生物'])
    expect(d.regions).toEqual(['英国'])
    expect(d.usages).toEqual(['trope'])
  })
})