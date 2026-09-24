import { describe, it, expect } from 'vitest'
import { assembleCardDTO } from './reviewService'
import type { QueueCandidate } from '../lib/review/queue'

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
})

describe('reviewService 认读干扰项闸门', () => {
  it('干扰项不足 3 个时剔除认读，其余模板保留', async () => {
    const { templatesWithDistractorGate } = await import('./reviewService')
    expect(templatesWithDistractorGate(['recognize', 'cloze'], 2)).toEqual(['cloze'])
    expect(templatesWithDistractorGate(['recognize', 'cloze'], 3)).toEqual(['recognize', 'cloze'])
  })
})
