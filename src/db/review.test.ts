import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerCards,
  registerAllWords,
  getCandidates,
  getAllCandidates,
  getAvailabilityMask,
  getTemplateLogs,
  getWordContent,
  getDistractorTranslations,
  getCardMeta,
  getState,
  applyReview,
  insertPracticeLog,
  setLastTemplate,
  getWeakCardIds,
  getWeakWordsWithCounts,
  getStrategyCounts,
  getStats,
  getAbsentWords,
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

  it('getDistractorTranslations 随机采样：同样输入多次取数不会总是同一组', async () => {
    await seedWord(db, 'w1', 'alpha')
    for (const [i, w] of ['beta', 'gamma', 'delta', 'epsilon'].entries()) await seedWord(db, `w${i + 2}`, w)
    await seedValue(db, 'fv1', 'w1', 'chinese_definition', '阿尔法')
    // 4 个候选里取 3：若按固定顺序截断，30 次结果会完全一致
    for (const [i, v] of ['贝塔', '伽马', '德尔塔', '艾普西龙'].entries()) {
      await seedValue(db, `fv${i + 10}`, `w${i + 2}`, 'chinese_definition', v)
    }
    const seen = new Set<string>()
    for (let i = 0; i < 30; i++) seen.add((await getDistractorTranslations('w1', 3, db)).join('|'))
    expect(seen.size).toBeGreaterThan(1)
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

describe('db/review 写路径与聚合', () => {
  let db: DbLike
  beforeEach(async () => { db = await createTestDb() })

  const cardIdOf = async (wordId: string) =>
    (await db.select<{ id: string }>('SELECT id FROM review_cards WHERE word_id = ?1', [wordId]))[0].id

  it('applyReview 首评写入状态与日志，mode 为 review', async () => {
    await seedWord(db, 'w1', 'alpha')
    await registerCards(['w1'], db)
    const c1 = await cardIdOf('w1')
    const r = await applyReview({
      cardId: c1, rating: 3, template: 'recognize',
      stability: 2.5, difficulty: 5.1, dueAt: NOW + 86400000,
      lapses: 0, reps: 1, reviewedAt: NOW, durationMs: 4200,
    }, db)
    expect(r.ok).toBe(true)
    const s = await getState(c1, db)
    expect(s.ok && s.data!.stability).toBeCloseTo(2.5, 6)
    expect(s.ok && s.data!.reps).toBe(1)
    const logs = await db.select<{ template: string; mode: string; duration_ms: number | null }>(
      'SELECT template, mode, duration_ms FROM review_logs WHERE card_id = ?1', [c1])
    expect(logs).toEqual([{ template: 'recognize', mode: 'review', duration_ms: 4200 }])
  })

  it('applyReview 同步更新 last_template', async () => {
    await seedWord(db, 'w1', 'alpha')
    await registerCards(['w1'], db)
    const c1 = await cardIdOf('w1')
    await applyReview({
      cardId: c1, rating: 3, template: 'cloze',
      stability: 2, difficulty: 5, dueAt: NOW + 86400000,
      lapses: 0, reps: 1, reviewedAt: NOW,
    }, db)
    const meta = await getCardMeta(c1, db)
    expect(meta.ok && meta.data!.lastTemplate).toBe('cloze')
  })

  it('applyReview 重复评分累加 reps 并覆盖 stability', async () => {
    await seedWord(db, 'w1', 'alpha')
    await registerCards(['w1'], db)
    const c1 = await cardIdOf('w1')
    await applyReview({ cardId: c1, rating: 3, template: 'recall', stability: 2, difficulty: 5,
      dueAt: NOW + 86400000, lapses: 0, reps: 1, reviewedAt: NOW }, db)
    await applyReview({ cardId: c1, rating: 1, template: 'recall', stability: 1, difficulty: 6,
      dueAt: NOW + 600000, lapses: 1, reps: 2, reviewedAt: NOW + 1000 }, db)
    const s = await getState(c1, db)
    expect(s.ok && s.data!.stability).toBeCloseTo(1, 6)
    expect(s.ok && s.data!.lapses).toBe(1)
    expect(s.ok && s.data!.reps).toBe(2)
  })

  it('getState 映射 lastReviewAt，无记录的 last_review_at 保持 null', async () => {
    await seedWord(db, 'w1', 'alpha')
    await registerCards(['w1'], db)
    const c1 = await cardIdOf('w1')
    await applyReview({ cardId: c1, rating: 3, template: 'recall', stability: 2, difficulty: 5,
      dueAt: NOW + 86400000, lapses: 0, reps: 1, reviewedAt: NOW - 3600_000 }, db)
    const first = await getState(c1, db)
    expect(first.ok && first.data!.lastReviewAt).toBe(NOW - 3600_000)
    await db.execute('UPDATE review_states SET last_review_at = NULL WHERE card_id = ?1', [c1])
    const cleared = await getState(c1, db)
    expect(cleared.ok && cleared.data!.lastReviewAt).toBeNull()
  })

  it('getState 无状态行返回 null', async () => {
    await seedWord(db, 'w1', 'alpha')
    await registerCards(['w1'], db)
    const r = await getState(await cardIdOf('w1'), db)
    expect(r.ok && r.data).toBeNull()
  })

  it('insertPracticeLog 只写日志，review_states 一行都不产生', async () => {
    await seedWord(db, 'w1', 'alpha')
    await registerCards(['w1'], db)
    const c1 = await cardIdOf('w1')
    await insertPracticeLog({ cardId: c1, rating: 1, template: 'cloze', reviewedAt: NOW }, db)
    const states = await db.select<{ c: number }>('SELECT count(*) as c FROM review_states')
    expect(states[0].c).toBe(0)
    const logs = await db.select<{ mode: string }>('SELECT mode FROM review_logs')
    expect(logs).toEqual([{ mode: 'practice' }])
  })

  it('setLastTemplate 记录上次出题模板', async () => {
    await seedWord(db, 'w1', 'alpha')
    await registerCards(['w1'], db)
    const c1 = await cardIdOf('w1')
    await setLastTemplate(c1, 'listen', db)
    const r = await db.select<{ last_template: string }>('SELECT last_template FROM review_cards WHERE id = ?1', [c1])
    expect(r[0].last_template).toBe('listen')
  })

  it('registerAllWords 给库里全部词补卡，无内容的词也注册，重复调用不新增', async () => {
    await seedWord(db, 'w1', 'alpha')
    await seedWord(db, 'w2', 'bare')
    await seedValue(db, 'fv1', 'w1', 'chinese_definition', '阿尔法')
    await registerAllWords(db)
    await registerAllWords(db)
    const rows = await db.select<{ word_id: string }>('SELECT word_id FROM review_cards ORDER BY word_id')
    expect(rows.map(r => r.word_id)).toEqual(['w1', 'w2'])
  })

  it('getWeakCardIds：lapses 达标 ∪ 窗口内 rating = 1（含 practice），窗口外不计入', async () => {
    for (const [i, lemma] of ['leech', 'recent', 'clean', 'stale'].entries()) await seedWord(db, `w${i + 1}`, lemma)
    await registerCards(['w1', 'w2', 'w3', 'w4'], db)
    const [c1, c2, c3, c4] = [await cardIdOf('w1'), await cardIdOf('w2'), await cardIdOf('w3'), await cardIdOf('w4')]
    const seedState = async (cardId: string, lapses: number) => {
      await db.execute(
        `INSERT INTO review_states (card_id, stability, difficulty, due_at, lapses, reps, suspended, last_review_at)
         VALUES (?1, 5, 5, 0, ?2, 6, 0, ?3)`, [cardId, lapses, NOW - 86400000])
    }
    await seedState(c1, 4)   // lapses 达标
    await seedState(c2, 0)   // 近 7 天答错
    await seedState(c3, 0)   // 干净
    await seedState(c4, 0)   // 30 天前答错，超出窗口
    await db.execute("INSERT INTO review_logs (id, card_id, reviewed_at, rating, template, mode) VALUES ('l1',?1,?2,1,'recall','review')", [c2, NOW - 2 * 86400000])
    await db.execute("INSERT INTO review_logs (id, card_id, reviewed_at, rating, template, mode) VALUES ('l2',?1,?2,1,'cloze','practice')", [c2, NOW - 3 * 86400000])
    await db.execute("INSERT INTO review_logs (id, card_id, reviewed_at, rating, template, mode) VALUES ('l3',?1,?2,1,'recall','review')", [c4, NOW - 30 * 86400000])
    const r = await getWeakCardIds({ leechThreshold: 4, recentWindowMs: 7 * 86400000, now: NOW }, db)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect([...r.data].sort()).toEqual([c1, c2].sort())
  })

  it('getWeakCardIds 只有 practice 日志同样命中', async () => {
    await seedWord(db, 'w1', 'practice')
    await registerCards(['w1'], db)
    const c1 = await cardIdOf('w1')
    await db.execute("INSERT INTO review_logs (id, card_id, reviewed_at, rating, template, mode) VALUES ('l1',?1,?2,1,'cloze','practice')", [c1, NOW - 1000])
    const r = await getWeakCardIds({ leechThreshold: 4, recentWindowMs: 7 * 86400000, now: NOW }, db)
    expect(r.ok && r.data).toEqual([c1])
  })

  it('getStrategyCounts：weak = lapses ≥ 阈值 ∪ 近 7 天 rating = 1，practice 也算', async () => {
    await seedWord(db, 'w1', 'leech')     // lapses 达标
    await seedWord(db, 'w2', 'recent')    // 近 7 天答错
    await seedWord(db, 'w3', 'clean')     // 干净
    await registerCards(['w1', 'w2', 'w3'], db)
    const [c1, c2, c3] = [await cardIdOf('w1'), await cardIdOf('w2'), await cardIdOf('w3')]
    await db.execute(`INSERT INTO review_states (card_id, stability, difficulty, due_at, lapses, reps, suspended, last_review_at)
      VALUES (?1, 5, 5, 0, 4, 6, 0, ?2)`, [c1, NOW - 86400000])
    await db.execute(`INSERT INTO review_states (card_id, stability, difficulty, due_at, lapses, reps, suspended, last_review_at)
      VALUES (?1, 5, 5, 0, 0, 2, 0, ?2)`, [c2, NOW - 86400000])
    await db.execute(`INSERT INTO review_states (card_id, stability, difficulty, due_at, lapses, reps, suspended, last_review_at)
      VALUES (?1, 50, 5, 0, 0, 9, 0, ?2)`, [c3, NOW - 86400000])
    await db.execute("INSERT INTO review_logs (id, card_id, reviewed_at, rating, template, mode) VALUES ('l1',?1,?2,1,'recall','review')", [c2, NOW - 2 * 86400000])
    await db.execute("INSERT INTO review_logs (id, card_id, reviewed_at, rating, template, mode) VALUES ('l2',?1,?2,1,'cloze','practice')", [c2, NOW - 3 * 86400000])
    const r = await getStrategyCounts({ leechThreshold: 4, recentWindowMs: 7 * 86400000, now: NOW }, db)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.weak).toBe(2)   // w1（lapses）+ w2（近错），w3 干净
  })

  it('getStrategyCounts：today 只数到期、未挂起且有可出题内容的词', async () => {
    await seedWord(db, 'w1', 'due')       // 到期 + 有内容
    await seedWord(db, 'w2', 'dueBare')   // 到期 + 无内容
    await seedWord(db, 'w3', 'later')     // 未到期 + 有内容
    await seedWord(db, 'w4', 'susp')     // 到期 + 有内容但挂起
    await registerCards(['w1', 'w2', 'w3', 'w4'], db)
    await seedValue(db, 'fv1', 'w1', 'chinese_definition', '到期')
    await seedValue(db, 'fv2', 'w3', 'chinese_definition', '未到期')
    await seedValue(db, 'fv3', 'w4', 'chinese_definition', '挂起')
    const [c1, c2, c3, c4] = [await cardIdOf('w1'), await cardIdOf('w2'), await cardIdOf('w3'), await cardIdOf('w4')]
    const seedState = async (cardId: string, dueAt: number, suspended: number) => {
      await db.execute(
        `INSERT INTO review_states (card_id, stability, difficulty, due_at, lapses, reps, suspended, last_review_at)
         VALUES (?1, 10, 5, ?2, 0, 3, ?3, 0)`, [cardId, dueAt, suspended])
    }
    await seedState(c1, NOW - 1000, 0)
    await seedState(c2, NOW - 1000, 0)
    await seedState(c3, NOW + 86400000, 0)
    await seedState(c4, NOW - 1000, 1)
    const r = await getStrategyCounts({ leechThreshold: 4, recentWindowMs: 7 * 86400000, now: NOW }, db)
    expect(r.ok && r.data.today).toBe(1)
  })

  it('getStrategyCounts：陈旧错题（超出窗口）不计入 weak', async () => {
    await seedWord(db, 'w1', 'stale')
    await registerCards(['w1'], db)
    const c1 = await cardIdOf('w1')
    await db.execute(`INSERT INTO review_states (card_id, stability, difficulty, due_at, lapses, reps, suspended, last_review_at)
      VALUES (?1, 5, 5, 0, 0, 2, 0, ?2)`, [c1, NOW - 30 * 86400000])
    await db.execute("INSERT INTO review_logs (id, card_id, reviewed_at, rating, template, mode) VALUES ('l1',?1,?2,1,'recall','review')", [c1, NOW - 30 * 86400000])
    const r = await getStrategyCounts({ leechThreshold: 4, recentWindowMs: 7 * 86400000, now: NOW }, db)
    expect(r.ok && r.data.weak).toBe(0)
  })

  it('getStats：掌握度分桶 / 未来 7 日到期 / 近期评分（只读 review）', async () => {
    for (const [i, lemma] of ['a', 'b', 'c', 'd', 'e', 'f'].entries()) await seedWord(db, `w${i + 1}`, lemma)
    await registerAllWords(db)
    // stability 分别落在掌握度 0/1/2/3/4 档；f 额外验证挂起卡不计入到期分布。
    const states: { word: string; stability: number | null; dueAt: number; suspended: number }[] = [
      { word: 'w1', stability: null, dueAt: NOW + 86400000, suspended: 0 },
      { word: 'w2', stability: 5, dueAt: NOW - 86400000, suspended: 0 },
      { word: 'w3', stability: 12, dueAt: NOW + 2 * 86400000, suspended: 0 },
      { word: 'w4', stability: 25, dueAt: NOW + 7 * 86400000, suspended: 0 },
      { word: 'w5', stability: 60, dueAt: NOW + 8 * 86400000, suspended: 0 },
      { word: 'w6', stability: 30, dueAt: NOW, suspended: 1 },
    ]
    for (const s of states) {
      await db.execute(
        `INSERT INTO review_states (card_id, stability, difficulty, due_at, lapses, reps, suspended, last_review_at)
         VALUES (?1, ?2, 5, ?3, 0, 3, ?4, ?5)`, [await cardIdOf(s.word), s.stability, s.dueAt, s.suspended, NOW])
    }
    for (const [i, rating] of [1, 2, 3, 4].entries()) {
      await db.execute(
        `INSERT INTO review_logs (id, card_id, reviewed_at, rating, template, mode) VALUES (?1,?2,?3,?4,'recall','review')`,
        [`r${i}`, await cardIdOf('w1'), NOW, rating])
    }
    await db.execute(
      `INSERT INTO review_logs (id, card_id, reviewed_at, rating, template, mode) VALUES ('p1',?1,?2,1,'recall','practice')`,
      [await cardIdOf('w1'), NOW])
    await db.execute(
      `INSERT INTO review_logs (id, card_id, reviewed_at, rating, template, mode) VALUES ('old',?1,?2,1,'recall','review')`,
      [await cardIdOf('w1'), NOW - 15 * 86400000])

    // 日历日标签由 SQLite 的 localtime 决定，测试里同源取一份，避免时区耦合。
    const [{ day }] = await db.select<{ day: string }>(
      "SELECT date(?1 / 1000, 'unixepoch', 'localtime') AS day", [NOW])

    const r = await getStats(NOW, db)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.masteryBuckets).toEqual([1, 1, 1, 2, 1])
    expect(r.data.dueByDay).toEqual([1, 1, 1, 0, 0, 0, 0, 1])
    expect(r.data.recentRatings).toEqual([{ day, again: 1, hard: 1, good: 2 }])
  })

  it('getStats：空库返回 5 个空分桶、8 个零到期日、空评分分布', async () => {
    const r = await getStats(NOW, db)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.masteryBuckets).toEqual([0, 0, 0, 0, 0])
    expect(r.data.dueByDay).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect(r.data.recentRatings).toEqual([])
  })

  it('getAbsentWords 返回无任何可用内容的词', async () => {
    await seedWord(db, 'w1', 'empty')
    await registerCards(['w1'], db)
    const r = await getAbsentWords(db)
    expect(r.ok && r.data.map(x => x.lemma)).toEqual(['empty'])
  })

  it('getAbsentWords：有内容的词不在列，返回 wordId', async () => {
    await seedWord(db, 'w1', 'full')
    await seedWord(db, 'w2', 'empty')
    await registerCards(['w1', 'w2'], db)
    await seedValue(db, 'fv1', 'w1', 'chinese_definition', '满')
    const r = await getAbsentWords(db)
    expect(r.ok && r.data).toEqual([{ wordId: 'w2', lemma: 'empty' }])
  })
})

describe('db/review 听辨门控与薄弱词计数', () => {
  it('getCandidates：缺省门控下音标齐全的词也不出听辨', async () => {
    const db = await createTestDb()
    await seedWord(db, 'w1', 'alpha')
    await seedValue(db, 'v1', 'w1', 'chinese_definition', '第一个')
    await seedValue(db, 'v2', 'w1', 'phonetic', 'ˈælfə')
    await registerAllWords(db)
    const r = await getCandidates(NOW, db)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const c = r.data.find(x => x.wordId === 'w1')
    expect(c?.availableTemplates).not.toContain('listen')
  })

  it('getCandidates：allowListen=true 时音标齐全的词出听辨', async () => {
    const db = await createTestDb()
    await seedWord(db, 'w1', 'alpha')
    await seedValue(db, 'v1', 'w1', 'chinese_definition', '第一个')
    await seedValue(db, 'v2', 'w1', 'phonetic', 'ˈælfə')
    await registerAllWords(db)
    const r = await getCandidates(NOW, db, { allowListen: true })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const c = r.data.find(x => x.wordId === 'w1')
    expect(c?.availableTemplates).toContain('listen')
  })

  it('getWeakWordsWithCounts：返回 lapses 与窗口内答错次数，顺序按 lapses 降序', async () => {
    const db = await createTestDb()
    await seedWord(db, 'w1', 'alpha')
    await seedWord(db, 'w2', 'beta')
    await seedWord(db, 'w3', 'gamma')
    await seedValue(db, 'v1', 'w1', 'chinese_definition', '第一个\n第二行不该被带出')
    await seedValue(db, 'v2', 'w2', 'chinese_definition', '第二个')
    await seedValue(db, 'v3', 'w3', 'chinese_definition', '第三个')
    await registerAllWords(db)

    // w1：连错 5 次；w2：无 lapses，但窗口内有 2 次 rating = 1；w3：干净
    await db.execute(
      `INSERT INTO review_states (card_id, stability, difficulty, due_at, lapses, reps, suspended)
       SELECT id, 5, 5, ?1, 5, 5, 0 FROM review_cards WHERE word_id = 'w1'`, [NOW])
    const w2card = await db.select<{ id: string }>("SELECT id FROM review_cards WHERE word_id = 'w2'")
    for (const t of [NOW - 1000, NOW - 2000]) {
      await db.execute(
        "INSERT INTO review_logs (id, card_id, reviewed_at, rating, template, mode) VALUES (?1,?2,?3,1,'recognize','practice')",
        [crypto.randomUUID(), w2card[0].id, t])
    }

    const r = await getWeakWordsWithCounts(
      { leechThreshold: 4, recentWindowMs: 7 * 86_400_000, now: NOW }, db)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.map(x => x.wordId)).toEqual(['w1', 'w2'])
    expect(r.data[0]).toMatchObject({ lemma: 'alpha', lapses: 5, recentMisses: 0 })
    expect(r.data[1]).toMatchObject({ lemma: 'beta', lapses: 0, recentMisses: 2 })
  })

  it('getWeakWordsWithCounts：窗口外的错题不计入', async () => {
    const db = await createTestDb()
    await seedWord(db, 'w1', 'alpha')
    await seedValue(db, 'v1', 'w1', 'chinese_definition', '第一个')
    await registerAllWords(db)
    const card = await db.select<{ id: string }>("SELECT id FROM review_cards WHERE word_id = 'w1'")
    await db.execute(
      "INSERT INTO review_logs (id, card_id, reviewed_at, rating, template, mode) VALUES (?1,?2,?3,1,'recognize','review')",
      [crypto.randomUUID(), card[0].id, NOW - 8 * 86_400_000])

    const r = await getWeakWordsWithCounts(
      { leechThreshold: 4, recentWindowMs: 7 * 86_400_000, now: NOW }, db)
    expect(r.ok && r.data).toEqual([])
  })

  // spec §8.1-3：两条查询是同一宽口径的两份实现（lapses ≥ 阈值 ∪ 窗口内 rating = 1，不按 mode 过滤），
  // 没有任何东西把它们绑在一起——一边改了口径，另一边照旧返回，页面上的「薄弱词 K」与列表就会
  // 悄悄对不上。这条测试把两份实现的 id 集合钉在一起。
  it('getWeakWordsWithCounts 与 getWeakCardIds 同一库上返回同一集合', async () => {
    const db = await createTestDb()
    for (const [i, lemma] of ['leech', 'recent', 'practiceOnly', 'clean', 'stale'].entries()) {
      await seedWord(db, `w${i + 1}`, lemma)
    }
    await registerAllWords(db)
    const cardOf = async (wordId: string) =>
      (await db.select<{ id: string }>('SELECT id FROM review_cards WHERE word_id = ?1', [wordId]))[0].id
    // 五个词覆盖判据的两支与两个反例：w1 只靠 lapses 达标、w2 只靠 review 日志、w3 只靠
    // practice 日志（两边都不按 mode 过滤）、w4 干净、w5 窗口外答错。
    const c1 = await cardOf('w1')
    const c2 = await cardOf('w2')
    const c3 = await cardOf('w3')
    await db.execute(
      `INSERT INTO review_states (card_id, stability, difficulty, due_at, lapses, reps, suspended)
       VALUES (?1, 5, 5, 0, 4, 6, 0)`, [c1])
    await db.execute("INSERT INTO review_logs (id, card_id, reviewed_at, rating, template, mode) VALUES ('l1',?1,?2,1,'recall','review')", [c2, NOW - 2 * 86_400_000])
    await db.execute("INSERT INTO review_logs (id, card_id, reviewed_at, rating, template, mode) VALUES ('l2',?1,?2,1,'cloze','practice')", [c3, NOW - 3 * 86_400_000])
    await db.execute("INSERT INTO review_logs (id, card_id, reviewed_at, rating, template, mode) VALUES ('l3',?1,?2,1,'recall','review')", [await cardOf('w5'), NOW - 30 * 86_400_000])

    const opts = { leechThreshold: 4, recentWindowMs: 7 * 86_400_000, now: NOW }
    const ids = await getWeakCardIds(opts, db)
    const rows = await getWeakWordsWithCounts(opts, db)
    expect(ids.ok).toBe(true)
    expect(rows.ok).toBe(true)
    if (!ids.ok || !rows.ok) return
    // 同一库同一口径：两边必须命中同一批词（w1 lapses 达标 / w2 窗口内 review 答错 /
    // w3 只有 practice 答错——两边都不按 mode 过滤；w4 干净、w5 窗口外，两边都不该命中）。
    expect(rows.data.map(w => w.wordId).sort()).toEqual(['w1', 'w2', 'w3'])
    // getWeakCardIds 给的是 card_id，映射回 word_id 后与列表逐词相同
    const words = new Set(
      (await db.select<{ word_id: string }>(
        `SELECT word_id FROM review_cards WHERE id IN (${ids.data.map(() => '?').join(',')})`, ids.data,
      )).map(r => r.word_id),
    )
    expect([...words].sort()).toEqual([...new Set(rows.data.map(w => w.wordId))].sort())
  })
})
