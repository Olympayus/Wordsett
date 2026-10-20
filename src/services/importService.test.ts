// src/services/importService.test.ts
// v0.7.5 Task 15：备份/恢复必须保留词条的 location（此前导入会把储藏库词条静默落回工作台）。
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { getDb } from '../db/connection'
import { createTestDb, type DbLike } from '../db/test-utils'
import { save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

vi.mock('../db/connection', () => ({
  getDb: vi.fn(),
  initDatabase: vi.fn(),
}))
vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(),
  open: vi.fn(),
}))
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
}))

import { applyImport } from './importService'
import { exportLibrary } from './exportService'

let adapter: DbLike
beforeAll(async () => {
  adapter = await createTestDb()
  vi.mocked(getDb).mockReturnValue(adapter as unknown as ReturnType<typeof getDb>)
})
beforeEach(async () => {
  vi.mocked(readTextFile).mockReset()
  vi.mocked(writeTextFile).mockReset()
  vi.mocked(save).mockReset()
  await adapter.execute('DELETE FROM words')
})

const snapshotJson = (words: unknown[]) => JSON.stringify({ formatVersion: 1, words })

async function locationOf(id: string): Promise<string | undefined> {
  const rows = await adapter.select<{ location: string }>('SELECT location FROM words WHERE id = ?', [id])
  return rows[0]?.location
}

describe('applyImport 词条位置（v0.7.5 Task 15）', () => {
  it('导入带 location 的快照时保留储藏库归属', async () => {
    vi.mocked(readTextFile).mockResolvedValue(snapshotJson([
      { id: 'w2', lemma: 'archive-me', normalizedLemma: 'archive-me', language: 'en', location: 'archive', createdAt: 1, updatedAt: 1 },
    ]))
    const r = await applyImport('/backup.json')
    expect(r.ok).toBe(true)
    expect(await locationOf('w2')).toBe('archive')
  })

  it('导入不带 location 的老快照时一律落 workspace', async () => {
    vi.mocked(readTextFile).mockResolvedValue(snapshotJson([
      { id: 'w1', lemma: 'old', normalizedLemma: 'old', language: 'en', createdAt: 1, updatedAt: 1 },
    ]))
    const r = await applyImport('/old-backup.json')
    expect(r.ok).toBe(true)
    expect(await locationOf('w1')).toBe('workspace')
  })

  it('导入非法 location（手改 / 未知值）时落回 workspace，不写坏值', async () => {
    vi.mocked(readTextFile).mockResolvedValue(snapshotJson([
      { id: 'w4', lemma: 'bad-location', normalizedLemma: 'bad-location', language: 'en', location: 'trash', createdAt: 1, updatedAt: 1 },
    ]))
    const r = await applyImport('/edited-backup.json')
    expect(r.ok).toBe(true)
    expect(await locationOf('w4')).toBe('workspace')
  })

  it('导出 → 导入往返保留储藏库词条', async () => {
    await adapter.execute(
      `INSERT INTO words (id, lemma, normalized_lemma, language, location, created_at, updated_at)
       VALUES ('w3', 'kept', 'kept', 'en', 'archive', 1, 2)`
    )
    vi.mocked(save).mockResolvedValue('/tmp/wordsett-backup.json')
    vi.mocked(writeTextFile).mockResolvedValue(undefined)
    const ex = await exportLibrary()
    expect(ex.ok).toBe(true)
    const exported = vi.mocked(writeTextFile).mock.calls[0][1] as string
    expect(exported).toContain('"location": "archive"')

    // 清空后重导入：模拟在同一台机器上恢复备份
    await adapter.execute('DELETE FROM words')
    vi.mocked(readTextFile).mockResolvedValue(exported)
    const im = await applyImport('/tmp/wordsett-backup.json')
    expect(im.ok).toBe(true)
    const rows = await adapter.select<{ lemma: string; location: string }>('SELECT lemma, location FROM words')
    expect(rows).toEqual([{ lemma: 'kept', location: 'archive' }])
  })
})
