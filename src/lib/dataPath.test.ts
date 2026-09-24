// src/lib/dataPath.test.ts
import { describe, it, expect, vi } from 'vitest'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

import { openDataDir } from './dataPath'

describe('openDataDir', () => {
  it('调用 open_data_dir 命令', async () => {
    invokeMock.mockReset()
    invokeMock.mockResolvedValue(undefined)
    await openDataDir()
    expect(invokeMock).toHaveBeenCalledWith('open_data_dir')
  })

  it('Rust 侧报错时向调用方抛出', async () => {
    // 注意：本仓库的 vitest 4.1.10 有个坑——只要 beforeEach 对同一 mock 调过
    // mockReset()/mockClear()，该用例里任何 rejected promise 都会被判成 unhandled
    // rejection 而记为失败，连 try/catch 和 expect().rejects 都救不回来（断言本身没错）。
    // 故这里不在 beforeEach 里 reset，改为每个用例体内自行 reset。
    invokeMock.mockReset()
    invokeMock.mockImplementation(() => Promise.reject(new Error('数据文件不存在')))
    await expect(openDataDir()).rejects.toThrow('数据文件不存在')
  })
})
