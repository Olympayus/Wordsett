import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { createTestDb, type DbLike } from '../db/test-utils'
import type { DbHandle } from '../db/init'
import { getWordDueStatus } from './wordDue'

const DAY = 86400000
const NOW = new Date('2026-11-16T12:00:00').getTime()

let adapter: DbLike
const h = () => adapter as unknown as DbHandle

beforeAll(async () => {
  adapter = await createTestDb()
})

afterEach(() => {
  vi.useRealTimers()
})

let seq = 0
async function seedWord(lemma: string, location: 'workspace' | 'archive' = 'workspace'): Promise<string> {
  seq++
  const id = `w${seq}`
  await adapter.execute(
    `INSERT INTO words (id, lemma, normalized_lemma, language, location, created_at, updated_at)
     VALUES (?1, ?2, ?3, 'en', ?4, 1, 1)`,
    [id, lemma, lemma.toLowerCase().trim(), location],
  )
  return id
}

async function seedCard(wordId: string, dueAt: number, suspended = false, template = 'recognize'): Promise<void> {
  seq++
  const cardId = `c${seq}`
  await adapter.execute(
    `INSERT INTO review_cards (id, word_id, template, created_at) VALUES (?1, ?2, ?3, 1)`,
    [cardId, wordId, template],
  )
  await adapter.execute(
    `INSERT INTO review_states (card_id, stability, difficulty, due_at, lapses, reps, suspended, last_review_at)
     VALUES (?1, 1, 1, ?2, 0, 1, ?3, 1)`,
    [cardId, dueAt, suspended ? 1 : 0],
  )
}

function freezeNow(): void {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
}

describe('getWordDueStatus', () => {
  it('workspace 词取最早未挂起卡判定逾期', async () => {
    freezeNow()
    const wordId = await seedWord('alpha')
    await seedCard(wordId, NOW - 2 * DAY, false, 'recognize')
    await seedCard(wordId, NOW - 9 * DAY, true, 'cloze')

    expect(await getWordDueStatus('alpha', 'workspace', h())).toEqual({ kind: 'overdue', days: 2 })
  })

  it('储藏库词不参与复习，即使库里有到期卡', async () => {
    freezeNow()
    const wordId = await seedWord('beta', 'archive')
    await seedCard(wordId, NOW - 3 * DAY)

    expect(await getWordDueStatus('beta', 'archive', h())).toEqual({ kind: 'archived' })
  })

  it('无 review_states 或全部挂起时为 none', async () => {
    freezeNow()
    const wordId = await seedWord('gamma')
    seq++
    await adapter.execute(
      `INSERT INTO review_cards (id, word_id, template, created_at) VALUES (?1, ?2, 'recognize', 1)`,
      [`c${seq}`, wordId],
    )
    expect(await getWordDueStatus('gamma', 'workspace', h())).toEqual({ kind: 'none' })

    const otherId = await seedWord('delta')
    await seedCard(otherId, NOW - DAY, true)
    expect(await getWordDueStatus('delta', 'workspace', h())).toEqual({ kind: 'none' })
  })

  it('今日到期统计次日 0 点前的未挂起卡数', async () => {
    freezeNow()
    const wordId = await seedWord('epsilon')
    await seedCard(wordId, NOW, false, 'recognize')
    await seedCard(wordId, NOW + 3 * 3600000, false, 'cloze')
    await seedCard(wordId, NOW + 3600000, true, 'listen')

    expect(await getWordDueStatus('epsilon', 'workspace', h())).toEqual({ kind: 'dueToday', cards: 2 })
  })

  it('查询按归一化词面匹配（大小写与首尾空白不敏感）', async () => {
    freezeNow()
    const wordId = await seedWord('zeta')
    await seedCard(wordId, NOW + 5 * DAY)

    expect(await getWordDueStatus('  Zeta ', 'workspace', h())).toEqual({ kind: 'upcoming', days: 5 })
  })
})
