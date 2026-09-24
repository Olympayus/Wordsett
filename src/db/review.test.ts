import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerCards,
  getCandidates,
  getAllCandidates,
  getAvailabilityMask,
  getTemplateLogs,
  getWordContent,
  getCardMeta,
} from './review'
import { createTestDb, type DbLike } from './test-utils'

const NOW = 1_700_000_000_000

async function seedWord(db: DbLike, id: string, lemma: string) {
  await db.execute(
    "INSERT INTO words (id, lemma, normalized_lemma, language, created_at, updated_at) VALUES (?1,?2,?2,'en',1,1)",
    [id, lemma],
  )
}

async function seedValue(db: DbLike, id: string, wordId: string, key: string, value: string) {
  await db.execute(
    `INSERT INTO field_values (id, word_id, field_id, value, source, edited, display_order, created_at, updated_at)
     VALUES (?1, ?2, (SELECT id FROM field_definitions WHERE key = ?3), ?4, 'ecdict', 0, 0, 1, 1)`,
    [id, wordId, key, value],
  )
}

describe('db/review 读路径', () => {
  let db: DbLike
  beforeEach(async () => { db = await createTestDb() })

  it('registerCards 幂等：同词重复注册不产生第二行', async () => {
    await seedWord(db, 'w1', 'alpha')
    await registerCards(['w1'], db)
    await registerCards(['w1'], db)
    const rows = await db.select<{ c: number }>('SELECT count(*) as c FROM review_cards')
    expect(rows[0].c).toBe(1)
  })

  it('getAvailabilityMask 按字段组返回布尔掩码', async () => {
    await seedWord(db, 'w1', 'alpha')
    await seedWord(db, 'w2', 'beta')
    await seedValue(db, 'fv1', 'w1', 'chinese_definition', '阿尔法')
    await seedValue(db, 'fv2', 'w1', 'example_sentence', 'alpha is first')
    await seedValue(db, 'fv3', 'w2', 'english_definition', 'the first letter')
    const r = await getAvailabilityMask(['w1', 'w2'], db)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.w1).toEqual({ translation: true, definition: false, example: true, phonetic: false })
    expect(r.data.w2).toEqual({ translation: false, definition: true, example: false, phonetic: false })
  })

  it('getAvailabilityMask 同义 key（example 与 example_sentence）都算命中', async () => {
    await seedWord(db, 'w1', 'alpha')
    await seedValue(db, 'fv1', 'w1', 'example', 'a short example')
    const r = await getAvailabilityMask(['w1'], db)
    expect(r.ok && r.data.w1.example).toBe(true)
  })

  it('getCandidates 只返回到期卡与未首评新卡，并带可用模板', async () => {
    await seedWord(db, 'w1', 'alpha')   // 到期
    await seedWord(db, 'w2', 'beta')    // 新卡
    await seedWord(db, 'w3', 'gamma')   // 未到期
    await registerCards(['w1', 'w2', 'w3'], db)
    await seedValue(db, 'fv1', 'w1', 'chinese_definition', '阿尔法')
    await seedValue(db, 'fv2', 'w2', 'chinese_definition', '贝塔')
    await seedValue(db, 'fv3', 'w3', 'chinese_definition', '伽马')
    const cardId = async (wordId: string) => {
      const r = await db.select<{ id: string }>('SELECT id FROM review_cards WHERE word_id = ?1', [wordId])
      return r[0].id
    }
    const c1 = await cardId('w1'), c3 = await cardId('w3')
    await db.execute(
      `INSERT INTO review_states (card_id, stability, difficulty, due_at, lapses, reps, suspended, last_review_at)
       VALUES (?1, 10, 5, ?2, 0, 3, 0, ?3)`, [c1, NOW - 1000, NOW - 86400000])
    await db.execute(
      `INSERT INTO review_states (card_id, stability, difficulty, due_at, lapses, reps, suspended, last_review_at)
       VALUES (?1, 10, 5, ?2, 0, 3, 0, ?3)`, [c3, NOW + 86400000, NOW])

    const r = await getCandidates(NOW, db)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const ids = r.data.map(c => c.wordId).sort()
    expect(ids).toEqual(['w1', 'w2'])
    expect(r.data.find(c => c.wordId === 'w1')!.availableTemplates).toContain('recognize')
    expect(r.data.find(c => c.wordId === 'w2')!.stability).toBeNull()
  })

  it('getCandidates 排除 suspended 卡', async () => {
    await seedWord(db, 'w1', 'alpha')
    await registerCards(['w1'], db)
    await seedValue(db, 'fv1', 'w1', 'chinese_definition', '阿尔法')
    const c1 = (await db.select<{ id: string }>('SELECT id FROM review_cards WHERE word_id = ?1', ['w1']))[0].id
    await db.execute(
      `INSERT INTO review_states (card_id, stability, difficulty, due_at, lapses, reps, suspended, last_review_at)
       VALUES (?1, 10, 5, ?2, 0, 3, 1, ?3)`, [c1, NOW - 1000, NOW - 86400000])
    const r = await getCandidates(NOW, db)
    expect(r.ok && r.data).toHaveLength(0)
  })

  it('getCandidates 带出 initial_familiarity，缺失时默认 1', async () => {
    await seedWord(db, 'w1', 'alpha')
    await seedWord(db, 'w2', 'beta')
    await registerCards(['w1', 'w2'], db)
    await seedValue(db, 'fv1', 'w1', 'chinese_definition', '阿尔法')
    await db.execute("UPDATE review_cards SET initial_familiarity = 3 WHERE word_id = 'w1'")
    const r = await getCandidates(NOW, db)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.find(c => c.wordId === 'w1')!.initialFamiliarity).toBe(3)
    expect(r.data.find(c => c.wordId === 'w2')!.initialFamiliarity).toBe(1)
  })

  it('getTemplateLogs 按卡分组返回日志，含 practice 模式', async () => {
    await seedWord(db, 'w1', 'alpha')
    await registerCards(['w1'], db)
    const c1 = (await db.select<{ id: string }>('SELECT id FROM review_cards WHERE word_id = ?1', ['w1']))[0].id
    await db.execute(
      "INSERT INTO review_logs (id, card_id, reviewed_at, rating, template, mode) VALUES ('l1',?1,1000,1,'recall','review')", [c1])
    await db.execute(
      "INSERT INTO review_logs (id, card_id, reviewed_at, rating, template, mode) VALUES ('l2',?1,2000,3,'recall','practice')", [c1])
    const r = await getTemplateLogs([c1], db)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data[c1]).toHaveLength(2)
    expect(r.data[c1].map(l => l.template)).toEqual(['recall', 'recall'])
  })

  it('getWordContent 取齐出题所需字段，并带 3 个跨词干扰释义', async () => {
    await seedWord(db, 'w1', 'alpha')
    for (const [i, w] of ['beta', 'gamma', 'delta', 'epsilon'].entries()) await seedWord(db, `w${i + 2}`, w)
    await seedValue(db, 'fv1', 'w1', 'chinese_definition', '阿尔法')
    await seedValue(db, 'fv2', 'w1', 'english_definition', 'the first letter')
    await seedValue(db, 'fv3', 'w1', 'example_sentence', 'Alpha comes first.')
    await seedValue(db, 'fv4', 'w1', 'phonetic', '/ˈælfə/')
    await seedValue(db, 'fv5', 'w1', 'part_of_speech', 'n.')
    for (const [i, v] of ['贝塔', '伽马', '德尔塔', '艾普西龙'].entries()) {
      await seedValue(db, `fv${i + 10}`, `w${i + 2}`, 'chinese_definition', v)
    }
    const c = await getWordContent('w1', db)
    expect(c).not.toBeNull()
    expect(c!.lemma).toBe('alpha')
    expect(c!.translation).toBe('阿尔法')
    expect(c!.definition).toBe('the first letter')
    expect(c!.example).toBe('Alpha comes first.')
    expect(c!.phonetic).toBe('/ˈælfə/')
    expect(c!.partOfSpeech).toBe('n.')
    expect(c!.distractors).toHaveLength(3)
    expect(c!.distractors).not.toContain('阿尔法')
  })

  it('getWordContent 词不存在返回 null', async () => {
    expect(await getWordContent('nope', db)).toBeNull()
  })

  it('getCardMeta 返回 last_template', async () => {
    await seedWord(db, 'w1', 'alpha')
    await registerCards(['w1'], db)
    const c1 = (await db.select<{ id: string }>('SELECT id FROM review_cards WHERE word_id = ?1', ['w1']))[0].id
    await db.execute('UPDATE review_cards SET last_template = ?1 WHERE id = ?2', ['cloze', c1])
    const r = await getCardMeta(c1, db)
    expect(r.ok && r.data!.lastTemplate).toBe('cloze')
  })

  it('getAllCandidates 含未到期的熟词，getCandidates 不含', async () => {
    await seedWord(db, 'w1', 'alpha')   // 未到期的熟词
    await seedWord(db, 'w2', 'beta')    // 到期的熟词
    await seedWord(db, 'w3', 'gamma')   // suspended 熟词
    await registerCards(['w1', 'w2', 'w3'], db)
    await seedValue(db, 'fv1', 'w1', 'chinese_definition', '阿尔法')
    await seedValue(db, 'fv2', 'w2', 'chinese_definition', '贝塔')
    await seedValue(db, 'fv3', 'w3', 'chinese_definition', '伽马')
    const cardId = async (wordId: string) => {
      const r = await db.select<{ id: string }>('SELECT id FROM review_cards WHERE word_id = ?1', [wordId])
      return r[0].id
    }
    const [c1, c2, c3] = await Promise.all([cardId('w1'), cardId('w2'), cardId('w3')])
    await db.execute(
      `INSERT INTO review_states (card_id, stability, difficulty, due_at, lapses, reps, suspended, last_review_at)
       VALUES (?1, 10, 5, ?2, 0, 3, 0, ?3)`, [c1, NOW + 86400000, NOW])
    await db.execute(
      `INSERT INTO review_states (card_id, stability, difficulty, due_at, lapses, reps, suspended, last_review_at)
       VALUES (?1, 10, 5, ?2, 0, 3, 0, ?3)`, [c2, NOW - 1000, NOW - 86400000])
    await db.execute(
      `INSERT INTO review_states (card_id, stability, difficulty, due_at, lapses, reps, suspended, last_review_at)
       VALUES (?1, 10, 5, ?2, 0, 3, 1, ?3)`, [c3, NOW - 1000, NOW - 86400000])
    const rAll = await getAllCandidates(db)
    expect(rAll.ok).toBe(true)
    if (!rAll.ok) return
    const allIds = rAll.data.map(c => c.wordId).sort()
    expect(allIds).toEqual(['w1', 'w2'])
    const r = await getCandidates(NOW, db)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.map(c => c.wordId)).toEqual(['w2'])
  })
})
