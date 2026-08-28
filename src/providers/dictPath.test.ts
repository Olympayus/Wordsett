// src/providers/dictPath.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

import { toSqliteUrl, resolveDictPath, resetDictPathCache } from './dictPath'

describe('toSqliteUrl', () => {
  it('拼接 sqlite: 前缀', () => {
    expect(toSqliteUrl('C:\\Program Files\\Wordsett\\ecdict.db'))
      .toBe('sqlite:C:\\Program Files\\Wordsett\\ecdict.db')
  })
})

describe('resolveDictPath', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    resetDictPathCache()
  })

  it('调用 dict_resource_path 命令', async () => {
    invokeMock.mockResolvedValue('D:\\Apps\\Wordsett\\wordnet.db')
    await expect(resolveDictPath('wordnet.db')).resolves.toBe('D:\\Apps\\Wordsett\\wordnet.db')
    expect(invokeMock).toHaveBeenCalledWith('dict_resource_path', { name: 'wordnet.db' })
  })

  it('同一 name 只 invoke 一次（缓存）', async () => {
    invokeMock.mockResolvedValue('X:\\dict.db')
    await resolveDictPath('ecdict.db')
    await resolveDictPath('ecdict.db')
    expect(invokeMock).toHaveBeenCalledTimes(1)
  })
})
