import { describe, it, expect, vi, beforeEach } from 'vitest'
import { assembleCardDTO } from './reviewService'
import type { QueueCandidate } from '../lib/review/queue'

const {
  invokeMock, getStateMock, applyReviewMock, insertPracticeLogMock,
  registerAllWordsMock, getCandidatesMock, getWordContentMock, getStatsMock,
} = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  getStateMock: vi.fn(),
  applyReviewMock: vi.fn(),
  insertPracticeLogMock: vi.fn(),
  registerAllWordsMock: vi.fn(),
  getCandidatesMock: vi.fn(),
  getWordContentMock: vi.fn(),
  getStatsMock: vi.fn(),
}))

// rateCard 只碰这三个 db 入口，直接打桩；fsrs_next 走 Tauri invoke，单独打桩。
// getOverview 另走 registerAllWords / getCandidates / getWordContent / getStats。
vi.mock('../db/review', () => ({
  getState: getStateMock,
  applyReview: applyReviewMock,
  insertPracticeLog: insertPracticeLogMock,
  registerAllWords: registerAllWordsMock,
  getCandidates: getCandidatesMock,
  getWordContent: getWordContentMock,
  getStats: getStatsMock,
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

const { rateCard, getOverview, REVIEW_DEFAULTS } = await import('./reviewService')

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

  it('认读：题面不含 answer 字段', () => {
    const dto = assembleCardDTO(candidate(), 'recognize', content, null)
    expect(Object.keys(dto.prompt)).not.toContain('translation')
    expect(Object.keys(dto.prompt)).not.toContain('definition')
  })

  it('填空：题面是挖空例句，答案是完整例句与目标词', () => {
    const dto = assembleCardDTO(candidate(), 'cloze', content, null)
    expect((dto.prompt as any).sentence).toContain('____')
    expect((dto.prompt as any).sentence).not.toContain('ephemeral')
    expect((dto.answer as any).lemma).toBe('ephemeral')
    expect((dto.answer as any).sentence).toBe(content.example)
  })

  it('中译英：题面是中文释义，答案是单词与音标', () => {
    const dto = assembleCardDTO(candidate(), 'recall', content, null)
    expect((dto.prompt as any).translation).toBe('短暂的')
    expect(dto.answer).toMatchObject({ lemma: 'ephemeral', phonetic: '/ɪˈfem(ə)rəl/' })
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
    const noExample = { ...content, example: '' }
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
})
