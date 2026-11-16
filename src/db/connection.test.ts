import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const calls: string[] = []
  return {
    calls,
    execute: vi.fn(async (sql: string) => {
      calls.push(sql)
    }),
    load: vi.fn(),
    ensureSchema: vi.fn(async () => {
      calls.push('ensureSchema')
    }),
  }
})

vi.mock('@tauri-apps/plugin-sql', () => ({ default: { load: mocks.load } }))
vi.mock('./init', () => ({ ensureSchema: mocks.ensureSchema }))

async function importConnection() {
  const { initDatabase } = await import('./connection')
  return initDatabase
}

describe('db/connection initDatabase', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.calls.length = 0
    mocks.execute.mockClear()
    mocks.ensureSchema.mockClear()
    mocks.load.mockReset()
    mocks.load.mockResolvedValue({ execute: mocks.execute })
  })

  it('runs pragmas before ensureSchema on the main connection', async () => {
    const initDatabase = await importConnection()
    await initDatabase()
    expect(mocks.load).toHaveBeenCalledWith('sqlite:wordsett.db')
    expect(mocks.calls).toEqual([
      'PRAGMA busy_timeout = 5000',
      'PRAGMA journal_mode = WAL',
      'ensureSchema',
    ])
  })

  it('skips ensureSchema when ensureSchema is false but still runs pragmas', async () => {
    const initDatabase = await importConnection()
    await initDatabase({ ensureSchema: false })
    expect(mocks.calls).toEqual(['PRAGMA busy_timeout = 5000', 'PRAGMA journal_mode = WAL'])
    expect(mocks.ensureSchema).not.toHaveBeenCalled()
  })

  it('initializes only once', async () => {
    const initDatabase = await importConnection()
    await initDatabase()
    await initDatabase()
    expect(mocks.load).toHaveBeenCalledTimes(1)
    expect(mocks.ensureSchema).toHaveBeenCalledTimes(1)
  })
})
