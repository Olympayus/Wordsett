import { describe, it, expect, vi, beforeEach } from 'vitest'
import { assembleCardDTO, blankOut, clozeSentence } from './reviewService'
import type { QueueCandidate } from '../lib/review/queue'

const {
  invokeMock, getStateMock, applyReviewMock, insertPracticeLogMock,
  registerAllWordsMock, getCandidatesMock, getWordContentMock, getStatsMock,
  getWeakWordsWithCountsMock, getAllCandidatesMock, getAbsentWordsMock,
  getTemplateLogsMock, getCardMetaMock, getAllWordCategoryMapMock,
} = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  getStateMock: vi.fn(),
  applyReviewMock: vi.fn(),
  insertPracticeLogMock: vi.fn(),
  registerAllWordsMock: vi.fn(),
  getCandidatesMock: vi.fn(),
  getWordContentMock: vi.fn(),
  getStatsMock: vi.fn(),
  getWeakWordsWithCountsMock: vi.fn(),
  getAllCandidatesMock: vi.fn(),
  getAbsentWordsMock: vi.fn(),
  getTemplateLogsMock: vi.fn(),
  getCardMetaMock: vi.fn(),
  getAllWordCategoryMapMock: vi.fn(),
}))

// rateCard 只碰这三个 db 入口，直接打桩；fsrs_next 走 Tauri invoke，单独打桩。
// getOverview 另走 registerAllWords / getCandidates / getWordContent / getStats。
// getQueue 走自由练习那一路：getAllCandidates 取池、getTemplateLogs + getCardMeta 取题型、
// getAbsentWords 收尾；分类范围还要 getAllWordCategoryMap（另一个 db 模块，动态 import）。
vi.mock('../db/review', () => ({
  getState: getStateMock,
  applyReview: applyReviewMock,
  insertPracticeLog: insertPracticeLogMock,
  registerAllWords: registerAllWordsMock,
  getCandidates: getCandidatesMock,
  getWordContent: getWordContentMock,
  getStats: getStatsMock,
  getWeakWordsWithCounts: getWeakWordsWithCountsMock,
  getAllCandidates: getAllCandidatesMock,
  getAbsentWords: getAbsentWordsMock,
  getTemplateLogs: getTemplateLogsMock,
  getCardMeta: getCardMetaMock,
}))
vi.mock('../db/categories', () => ({ getAllWordCategoryMap: getAllWordCategoryMapMock }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

const { rateCard, getOverview, getQueue, REVIEW_DEFAULTS, getWeakWords } = await import('./reviewService')

const scoringInput = {
  cardId: 'c1', rating: 3, template: 'cloze' as const, mode: 'review' as const,
}
const fsrsReply = { again: { stability: 1, difficulty: 5, intervalDays: 1 }, hard: { stability: 2, difficulty: 5, intervalDays: 2 }, good: { stability: 10, difficulty: 5, intervalDays: 10 }, easy: { stability: 20, difficulty: 5, intervalDays: 20 } }

beforeEach(() => {
  invokeMock.mockReset(); getStateMock.mockReset(); applyReviewMock.mockReset(); insertPracticeLogMock.mockReset()
  invokeMock.mockResolvedValue(fsrsReply)
  getStateMock.mockResolvedValue({ ok: true, data: { stability: 10, difficulty: 5, reps: 3, lapses: 0, lastReviewAt: null } })
  applyReviewMock.mockResolvedValue({ ok: true, data: undefined })
  insertPracticeLogMock.mockResolvedValue({ ok: true, data: undefined })
})

describe('reviewService.rateCard 落库结果', () => {
  it('计分成功：ok 且带回刚写入的到期时间', async () => {
    const res = await rateCard(scoringInput)
    expect(res.ok).toBe(true)
    expect(res.error).toBeUndefined()
    // dueAt 必须等于传给 applyReview 的那个值（不是重新算的 now）
    expect(res.dueAt).toBe(applyReviewMock.mock.calls[0][0].dueAt)
    expect(res.dueAt).toBeGreaterThan(Date.now())
  })

  it('applyReview 失败（DbResult 非抛错）：ok:false 带出 error，不写成功到期时间', async () => {
    applyReviewMock.mockResolvedValue({ ok: false, error: 'SQLITE_BUSY' })
    const res = await rateCard(scoringInput)
    expect(res).toMatchObject({ ok: false, error: 'SQLITE_BUSY', dueAt: null })
  })

  it('getState 失败：不写任何数据，直接返回失败（避免把已复习的卡当新卡重算）', async () => {
    getStateMock.mockResolvedValue({ ok: false, error: 'read failed' })
    const res = await rateCard(scoringInput)
    expect(res).toMatchObject({ ok: false, error: 'read failed', dueAt: null })
    expect(applyReviewMock).not.toHaveBeenCalled()
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('练习模式：失败也透出 error，dueAt 恒为 null（不排期）', async () => {
    insertPracticeLogMock.mockResolvedValue({ ok: false, error: 'log failed' })
    const res = await rateCard({ cardId: 'c1', rating: 1, template: 'cloze', mode: 'practice' })
    expect(res).toMatchObject({ ok: false, error: 'log failed', dueAt: null })
  })

  it('retention 透传给 fsrs_next（并按 0.7~0.98 夹紧）', async () => {
    await rateCard({ ...scoringInput, retention: 0.95 })
    expect(invokeMock).toHaveBeenCalledWith('fsrs_next', expect.objectContaining({ retention: 0.95 }))
    invokeMock.mockClear()
    await rateCard({ ...scoringInput, retention: 0.1 })
    expect(invokeMock).toHaveBeenCalledWith('fsrs_next', expect.objectContaining({ retention: 0.7 }))
  })
})

const NOW = Date.now()
const MS_PER_DAY = 86_400_000

const candidate = (o: Partial<QueueCandidate> = {}): QueueCandidate => ({
  cardId: 'c1', wordId: 'w1', stability: 10, dueAt: NOW, lastReviewAt: NOW - 10 * MS_PER_DAY,
  initialFamiliarity: 1, availableTemplates: ['recognize', 'cloze', 'recall'], ...o,
})

const content = {
  lemma: 'ephemeral',
  phonetic: '/ɪˈfem(ə)rəl/',
  partOfSpeech: 'adj.',
  translation: '短暂的',
  definition: 'lasting for a very short time',
  example: 'Fame in this business is ephemeral.',
  exampleGloss: 'lasting for a very short time',
  matchedPos: 'adj.',
  firstSensePos: 'adj.',
  distractors: ['持久的', '明显的', '丰富的'],
}

describe('reviewService.assembleCardDTO', () => {
  it('认读：题面是单词 + 4 选 1，答案是释义与词性', () => {
    const dto = assembleCardDTO(candidate(), 'recognize', content, null)
    expect(dto.template).toBe('recognize')
    expect(dto.prompt).toMatchObject({ lemma: 'ephemeral' })
    expect((dto.prompt as any).options).toHaveLength(4)
    expect((dto.prompt as any).options).toContain('短暂的')
    expect(dto.answer).toMatchObject({ translation: '短暂的', partOfSpeech: 'adj.' })
    expect((dto.answer as any).lemma).toBeUndefined()
  })

  it('认读：题面不含 answer 字段，但带词性（v0.6.3 条目 3，评审修复 F1）', () => {
    // 词性必须落在 prompt 上：认读卡面把它渲染在音标之后（design doc §6.2），
    // 缺了这个字段那段渲染就永远走不到（分支恒假）。answer 侧那份保留不动。
    const dto = assembleCardDTO(candidate(), 'recognize', content, null)
    expect(Object.keys(dto.prompt)).not.toContain('translation')
    expect(Object.keys(dto.prompt)).not.toContain('definition')
    expect((dto.prompt as any).partOfSpeech).toBe('adj.')
    expect(dto.answer).toMatchObject({ partOfSpeech: 'adj.' })
  })

  it('填空：题面是挖空例句，答案是完整例句与目标词', () => {
    const dto = assembleCardDTO(candidate(), 'cloze', content, null)
    expect((dto.prompt as any).sentence).toContain('____')
    expect((dto.prompt as any).sentence).not.toContain('ephemeral')
    expect((dto.answer as any).lemma).toBe('ephemeral')
    expect((dto.answer as any).sentence).toBe(content.example)
  })

  it('填空：词性以括号入句，释义独立成字段（v0.6.2 条目 5），题面仍不含目标词', () => {
    // v0.6.2 起释义不再拼进 sentence，改由 prompt.gloss 承载、前端另起一行渲染。
    const dto = assembleCardDTO(candidate(), 'cloze', content, null)
    expect((dto.prompt as any).sentence).toBe('Fame in this business is ____ (adj.).')
    expect((dto.prompt as any).gloss).toBe('lasting for a very short time')
    expect((dto.prompt as any).partOfSpeech).toBe('adj.')
    expect((dto.prompt as any).sentence).not.toContain('在句中意为')
    expect((dto.prompt as any).sentence).not.toContain('ephemeral')
  })

  it('填空：配对释义缺失时 gloss 为空串（前端据此不渲染释义行）', () => {
    const noGloss = { ...content, exampleGloss: '' }
    const dto = assembleCardDTO(candidate(), 'cloze', noGloss, null)
    const sentence = String((dto.prompt as any).sentence)
    expect(sentence).toContain('____')
    expect(sentence).not.toContain('在句中意为')
    expect((dto.prompt as any).gloss).toBe('')
  })

  it('填空：例句不含目标词时不得虚构题面（只赔上原句，不追加空白）', () => {
    // 上游 getWordContent 本不该放行这种例句；这里钉住防御分支，避免回归成
    // 「整句 + 空白」那种看起来像空单词的题面。
    const unmatched = { ...content, example: 'The soldiers fanned out', exampleGloss: '' }
    const dto = assembleCardDTO(candidate(), 'cloze', unmatched, null)
    expect((dto.prompt as any).sentence).toBe('The soldiers fanned out')
    expect((dto.prompt as any).sentence).not.toContain('____')
  })

  it('中译英：题面是中文释义，答案是单词与音标', () => {
    const dto = assembleCardDTO(candidate(), 'recall', content, null)
    expect((dto.prompt as any).translation).toBe('短暂的')
    expect(dto.answer).toMatchObject({ lemma: 'ephemeral', phonetic: '/ɪˈfem(ə)rəl/' })
  })

  it('中译英：题面词性读 firstSensePos，不读 partOfSpeech（v0.6.3 条目 4a）', () => {
    // 夹具里 partOfSpeech 与 firstSensePos 取不同的值：若 recall 退回读 content.partOfSpeech，
    // 这条会红。两个字段语义不同（前者跟例句走、后者跟中文释义走），不该被合并。
    const mixed = { ...content, partOfSpeech: 'n.', firstSensePos: 'adj.' }
    const dto = assembleCardDTO(candidate(), 'recall', mixed, null)
    expect((dto.prompt as any).partOfSpeech).toBe('adj.')
    expect((dto.prompt as any).partOfSpeech).not.toBe(mixed.partOfSpeech)
  })

  it('英文释义题：题面是英文释义，答案是单词与音标', () => {
    const dto = assembleCardDTO(candidate(), 'english_def', content, null)
    expect((dto.prompt as any).definition).toBe(content.definition)
    expect(dto.answer).toMatchObject({ lemma: 'ephemeral' })
  })

  it('听辨：题面不含任何文本（只有播放意图），答案是词与释义', () => {
    const dto = assembleCardDTO(candidate(), 'listen', content, null)
    expect(Object.keys(dto.prompt)).toEqual(['playAudio'])
    expect(JSON.stringify(dto.prompt)).not.toContain('ephemeral')
    expect(dto.answer).toMatchObject({ lemma: 'ephemeral', translation: '短暂的' })
  })

  it('sched 带出调度派生量，不含词条内容', () => {
    const dto = assembleCardDTO(candidate(), 'recognize', content, 'cloze')
    expect(dto.sched.mastery).toBeCloseTo(Math.exp(-7 / 10), 6)
    expect(dto.sched.rNow).toBeCloseTo(Math.exp(-1), 6)
    expect(dto.sched.lapses).toBe(0)
    expect(JSON.stringify(dto.sched)).not.toContain('ephemeral')
  })

  it('新卡的 mastery 为 null，rNow 走熟悉度映射', () => {
    const dto = assembleCardDTO(candidate({ stability: null, initialFamiliarity: 2 }), 'recognize', content, null)
    expect(dto.sched.mastery).toBeNull()
    expect(dto.sched.rNow).toBeCloseTo(0.45, 6)
  })

  it('填空题干缺例句时回退：挖空失败不产生空题面', () => {
    const noExample = { ...content, example: '', exampleGloss: '' }
    const dto = assembleCardDTO(candidate(), 'cloze', noExample, null)
    expect((dto.prompt as any).sentence.length).toBeGreaterThan(0)
  })

  it('认读：与正确释义同文 / 重复的干扰项被剔除，选项两两不同', () => {
    const messy = { ...content, distractors: ['短暂的', '持久的', '持久的', '明显的', '丰富的'] }
    const dto = assembleCardDTO(candidate(), 'recognize', messy, null)
    const options = (dto.prompt as any).options as string[]
    expect(options).toHaveLength(4)
    expect(new Set(options).size).toBe(options.length)
    expect(options.filter(o => o === '短暂的')).toHaveLength(1)
  })
})

describe('clozeSentence：挖空 + 词性入句（v0.6.2 条目 5）', () => {
  it('词性以括号插在挖空之后', () => {
    expect(clozeSentence('The soldiers fanned out.', 'fan', 'v.'))
      .toBe('The soldiers ____ (v.) out.')
  })

  it('词性为空时不插括号', () => {
    expect(clozeSentence('The soldiers fanned out.', 'fan', ''))
      .toBe('The soldiers ____ out.')
  })

  it('挖空为目标词的词形变化（复数 / 时态）', () => {
    expect(clozeSentence('The soldiers fanned out.', 'fan', 'v.'))
      .toContain('____')
    expect(clozeSentence('He implies things.', 'implication', 'n.'))
      .toBe('He implies things.')   // 例句不含原词 → 原样返回，与 blankOut 同口径
  })

  it('句子为空时退化为一条横线，不抛异常', () => {
    expect(clozeSentence('', 'fan', 'v.')).toBe('____ (v.)')
  })

  it('blankOut 不再接受 gloss 参数，只挖空', () => {
    // 钉住签名收窄：第三参若还有人传，这里会因为 JS 忽略多余参数而静默通过，
    // 所以真正的守卫是 TypeScript——这一条只钉住「返回值里不再有『在句中意为』」。
    expect(blankOut('The soldiers fanned out.', 'fan')).toBe('The soldiers ____ out.')
    expect(blankOut('The soldiers fanned out.', 'fan')).not.toContain('在句中意为')
  })
})

describe('reviewService 认读干扰项闸门', () => {
  it('干扰项不足 3 个时剔除认读，其余模板保留', async () => {
    const { templatesWithDistractorGate } = await import('./reviewService')
    expect(templatesWithDistractorGate(['recognize', 'cloze'], 2)).toEqual(['cloze'])
    expect(templatesWithDistractorGate(['recognize', 'cloze'], 3)).toEqual(['recognize', 'cloze'])
  })
})

describe('reviewService.getOverview 用组卷同一道认读闸门', () => {
  beforeEach(() => {
    registerAllWordsMock.mockReset()
    getCandidatesMock.mockReset()
    getWordContentMock.mockReset()
    getStatsMock.mockReset()
    registerAllWordsMock.mockResolvedValue(undefined)
    getStatsMock.mockResolvedValue({
      ok: true,
      data: { masteryBuckets: [1, 0, 0, 0, 0], dueByDay: Array(8).fill(0), recentRatings: [] },
    })
  })

  it('只有认读可出、干扰释义不足 3 个：承诺 0 张（点得动的张数）', async () => {
    getCandidatesMock.mockResolvedValue({ ok: true, data: [candidate({ availableTemplates: ['recognize'] })] })
    getWordContentMock.mockResolvedValue({ ...content, distractors: ['持久的'] })
    const o = await getOverview(REVIEW_DEFAULTS)
    expect(o.total).toBe(0)
    expect(o.estimateMinutes).toBe(1)
  })

  it('干扰释义够 3 个：同一张卡计入承诺张数', async () => {
    getCandidatesMock.mockResolvedValue({ ok: true, data: [candidate({ availableTemplates: ['recognize'] })] })
    getWordContentMock.mockResolvedValue(content)
    const o = await getOverview(REVIEW_DEFAULTS)
    expect(o.total).toBe(1)
    expect(o.newCount).toBe(0)
  })

  it('只有 cloze 可出、例句取不到：承诺 0 张（与 getQueue 一致，v0.6.3 条目 4c）', async () => {
    // 概览与组卷必须给出同一个数：deliverable() 也要过 templatesWithExampleGate。
    // 修复前 deliverable() 只过干扰项闸门，会把这张词算进承诺张数，而 getQueue 出 0 题。
    getCandidatesMock.mockResolvedValue({ ok: true, data: [candidate({ availableTemplates: ['cloze'] })] })
    getWordContentMock.mockResolvedValue({ ...content, example: '' })
    const o = await getOverview(REVIEW_DEFAULTS)
    expect(o.total).toBe(0)
    expect(o.estimateMinutes).toBe(1)
  })

  it('只有 cloze 可出、例句取不到：getQueue 同样出 0 题（钉住概览 = 组卷）', async () => {
    // 与上一条同一夹具，走 getQueue 的 today 路径：概览承诺 0 张时，组卷必须也是 0 题。
    registerAllWordsMock.mockResolvedValue(undefined)
    getCandidatesMock.mockResolvedValue({ ok: true, data: [candidate({ availableTemplates: ['cloze'] })] })
    getTemplateLogsMock.mockResolvedValue({ ok: true, data: {} })
    getCardMetaMock.mockResolvedValue({ ok: true, data: null })
    getAbsentWordsMock.mockResolvedValue({ ok: true, data: [] })
    getWordContentMock.mockResolvedValue({ ...content, example: '' })
    const { queue } = await getQueue('today', REVIEW_DEFAULTS)
    expect(queue).toEqual([])
  })

  it('概览承诺张数 = getQueue 实际出题数（同一夹具，v0.6.3 条目 4c）', async () => {
    // 三条候选：一条只有 cloze 且例句取不到（两道闸门都过不了），一条只有 cloze 但例句可用，
    // 一条只有 recognize 且干扰项够。概览必须承诺 2 张，组卷必须出 2 题。
    registerAllWordsMock.mockResolvedValue(undefined)
    getCandidatesMock.mockResolvedValue({ ok: true, data: [
      candidate({ cardId: 'c1', wordId: 'w1', availableTemplates: ['cloze'] }),
      candidate({ cardId: 'c2', wordId: 'w2', availableTemplates: ['cloze'] }),
      candidate({ cardId: 'c3', wordId: 'w3', availableTemplates: ['recognize'] }),
    ] })
    getTemplateLogsMock.mockResolvedValue({ ok: true, data: {} })
    getCardMetaMock.mockResolvedValue({ ok: true, data: null })
    getAbsentWordsMock.mockResolvedValue({ ok: true, data: [] })
    getWordContentMock.mockImplementation(async (wordId: string) => {
      if (wordId === 'w1') return { ...content, example: '' }   // 例句取不到 → 两道闸门都过不了
      if (wordId === 'w2') return content                        // cloze 可出
      return { ...content, distractors: ['持久的', '明显的', '丰富的'] } // recognize 可出
    })
    const o = await getOverview(REVIEW_DEFAULTS)
    const { queue } = await getQueue('today', REVIEW_DEFAULTS)
    expect(o.total).toBe(2)
    expect(queue).toHaveLength(2)
    expect(o.total).toBe(queue.length)
  })
})

describe('reviewService 薄弱词列表', () => {
  beforeEach(() => {
    getWeakWordsWithCountsMock.mockReset()
  })

  it('无薄弱词时返回空数组，不抛异常', async () => {
    getWeakWordsWithCountsMock.mockResolvedValue({ ok: true, data: [] })
    const r = await getWeakWords(REVIEW_DEFAULTS)
    expect(Array.isArray(r)).toBe(true)
    expect(r).toEqual([])
  })

  it('db 层查询失败：吞掉 ok:false 返回空数组，不抛异常', async () => {
    getWeakWordsWithCountsMock.mockResolvedValue({ ok: false, error: 'SQLITE_BUSY' })
    const r = await getWeakWords(REVIEW_DEFAULTS)
    expect(r).toEqual([])
  })
})

describe('reviewService.getQueue 自由练习的分类范围（v0.6.2 条目 10）', () => {
  beforeEach(() => {
    registerAllWordsMock.mockReset(); getAllCandidatesMock.mockReset(); getAbsentWordsMock.mockReset()
    getTemplateLogsMock.mockReset(); getCardMetaMock.mockReset()
    getWordContentMock.mockReset(); getAllWordCategoryMapMock.mockReset()
    registerAllWordsMock.mockResolvedValue(undefined)
    getAbsentWordsMock.mockResolvedValue({ ok: true, data: [] })
    getTemplateLogsMock.mockResolvedValue({ ok: true, data: {} })
    getCardMetaMock.mockResolvedValue({ ok: true, data: null })
    getWordContentMock.mockResolvedValue(content)
  })

  it('空选区出 0 题，不是整库（fail-closed 的服务层守卫）', async () => {
    // 池子里有 3 张卡；空选区必须一张都不出。这条断言钉的是 filterFree 自己的
    // `categoryIds.length === 0 → []` 守卫——没有它就会掉到末尾的 'random' 分支交出整库。
    // selectByCategories 自己的空数组守卫够不着这里（filterFree 先一步就 return 了）。
    getAllCandidatesMock.mockResolvedValue({ ok: true, data: [
      candidate({ cardId: 'c1', wordId: 'w1' }),
      candidate({ cardId: 'c2', wordId: 'w2' }),
      candidate({ cardId: 'c3', wordId: 'w3' }),
    ] })
    const { queue } = await getQueue('free', REVIEW_DEFAULTS, { kind: 'category', categoryIds: [], limit: 20 })
    expect(queue).toEqual([])
  })

  it('空选区时连分类映射都不必读：守卫在读库之前就短路了', async () => {
    getAllCandidatesMock.mockResolvedValue({ ok: true, data: [candidate({ cardId: 'c1', wordId: 'w1' })] })
    await getQueue('free', REVIEW_DEFAULTS, { kind: 'category', limit: 20 })
    expect(getAllWordCategoryMapMock).not.toHaveBeenCalled()
  })

  it('并集出题：勾两个分类，两个分类各自命中的词都进，同一个词只出一张卡', async () => {
    // w2 同属 c1 与 c2 —— 只能出一张
    getAllCandidatesMock.mockResolvedValue({ ok: true, data: [
      candidate({ cardId: 'c1', wordId: 'w1' }),
      candidate({ cardId: 'c2', wordId: 'w2' }),
      candidate({ cardId: 'c3', wordId: 'w3' }),
    ] })
    getAllWordCategoryMapMock.mockResolvedValue({ ok: true, data: { w1: ['c1'], w2: ['c1', 'c2'], w3: ['c2'] } })
    const { queue } = await getQueue('free', REVIEW_DEFAULTS, { kind: 'category', categoryIds: ['c1', 'c2'], limit: 20 })
    expect(queue.map(c => c.wordId).sort()).toEqual(['w1', 'w2', 'w3'])
  })

  it('单分类只出该分类的词；没勾中的分类一个都不出', async () => {
    getAllCandidatesMock.mockResolvedValue({ ok: true, data: [
      candidate({ cardId: 'c1', wordId: 'w1' }),
      candidate({ cardId: 'c2', wordId: 'w2' }),
    ] })
    getAllWordCategoryMapMock.mockResolvedValue({ ok: true, data: { w1: ['c1'], w2: ['c2'] } })
    const only = await getQueue('free', REVIEW_DEFAULTS, { kind: 'category', categoryIds: ['c1'], limit: 20 })
    expect(only.queue.map(c => c.wordId)).toEqual(['w1'])
    const none = await getQueue('free', REVIEW_DEFAULTS, { kind: 'category', categoryIds: ['c9'], limit: 20 })
    expect(none.queue).toEqual([])
  })

  it('分类映射读失败：出 0 题，不把整库当成分类强化的结果', async () => {
    getAllCandidatesMock.mockResolvedValue({ ok: true, data: [candidate({ cardId: 'c1', wordId: 'w1' })] })
    getAllWordCategoryMapMock.mockResolvedValue({ ok: false, error: 'SQLITE_BUSY' })
    const { queue } = await getQueue('free', REVIEW_DEFAULTS, { kind: 'category', categoryIds: ['c1'], limit: 20 })
    expect(queue).toEqual([])
  })
})
