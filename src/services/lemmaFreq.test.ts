import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getCachedDbMock, resolveDictPathMock } = vi.hoisted(() => ({
  getCachedDbMock: vi.fn(),
  resolveDictPathMock: vi.fn(async () => 'test.db'),
}))
vi.mock('../providers/dbCache', () => ({ getCachedDb: getCachedDbMock }))
vi.mock('../providers/dictPath', () => ({
  resolveDictPath: resolveDictPathMock,
  toSqliteUrl: vi.fn((p: string) => `sqlite:${p}`),
}))

import { getWordFreqs, parseFrequencyRows } from './lemmaFreq'

describe('parseFrequencyRows', () => {
  it('parses lowercase keys and defaults null to zero', () => {
    const m = parseFrequencyRows([{ word: 'Ephemeral', frequency: 10 }, { word: 'apple', frequency: null }])
    expect(m.get('ephemeral')).toBe(10)
    expect(m.get('apple')).toBe(0)
  })
})

describe('getWordFreqs', () => {
  const select = vi.fn()
  beforeEach(() => {
    select.mockReset()
    getCachedDbMock.mockReset()
    resolveDictPathMock.mockClear()
    getCachedDbMock.mockResolvedValue({ select })
  })

  it('查询 lemmas 表：输入小写去重后绑定参数，无行词不出现在 Map 中（freqOf 得 undefined）', async () => {
    select.mockResolvedValue([{ word: 'ephemeral', frequency: 10 }])
    const m = await getWordFreqs(['Ephemeral', 'ephemeral', 'ZZZUnknown'])

    expect(m.get('ephemeral')).toBe(10)
    // 控制器裁决：无 lemmas 行的词必须被省略，而不是物化为 0——否则会冒充「已知最罕见」排到最前
    expect(m.has('zzzunknown')).toBe(false)
    expect(m.get('zzzunknown')).toBeUndefined()

    expect(resolveDictPathMock).toHaveBeenCalledWith('ecdict.db')
    expect(getCachedDbMock).toHaveBeenCalledWith('sqlite:test.db')
    const [sql, params] = select.mock.calls[0]
    expect(sql).toMatch(/SELECT word, frequency FROM lemmas WHERE word IN \(\?1,\s*\?2\)/)
    expect(params).toEqual(['ephemeral', 'zzzunknown'])
  })

  it('空输入直接返回空 Map，不访问数据库', async () => {
    await expect(getWordFreqs([])).resolves.toEqual(new Map())
    expect(resolveDictPathMock).not.toHaveBeenCalled()
    expect(getCachedDbMock).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
  })

  it('查询失败返回空 Map（候选排序回退到未知词频，不阻断小窗）', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    select.mockRejectedValue(new Error('db gone'))
    await expect(getWordFreqs(['apple'])).resolves.toEqual(new Map())
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
