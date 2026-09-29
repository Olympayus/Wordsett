import { describe, it, expect } from 'vitest'
import {
  roundSummary, templateCounts, templateAccuracy, ratingDistribution, ratingSeries, wordLabelFor, isSkipped, answerDisplay, correctnessLabel,
} from './roundStats'
import type { ReviewCardDTO } from '../../services/reviewService'
import { TEMPLATE_DIFFICULTY } from './template'

const card = (cardId: string, template: ReviewCardDTO['template'], prompt: any, answer: any): ReviewCardDTO =>
  ({ cardId, wordId: `w-${cardId}`, template, prompt, answer, sched: { dueAt: 0, reps: 0, lapses: 0, lastReviewAt: null, mastery: null, rNow: 0, defaultRating: null } })

describe('roundSummary', () => {
  it('答题数与正确数按 rating>=3 计', () => {
    const s = roundSummary([], [{ cardId: 'a', rating: 3, template: 'recognize', input: 'x' }, { cardId: 'b', rating: 1, template: 'cloze', input: 'y' }])
    expect(s.answeredCount).toBe(2)
    expect(s.correctCount).toBe(1)
    expect(s.accuracy).toBe('50%')
  })

  it('已答 0 时正确率是 —（Review Focus 2 的同一条口径）', () => {
    expect(roundSummary([], []).accuracy).toBe('—')
  })

  it('跳过只数带标记的记录——rating 1 + input 为空但没标记，是「没打字就评了忘了」', () => {
    // 这条在 v0.6.4 前是 1（判据从空串反推），现在必须退回 0：
    // 空串是「作答内容」而不是「意图」，中译英这类题不输入直接提交后评「忘了」是合法的。
    const s = roundSummary([], [
      { cardId: 'a', rating: 1, template: 'recognize', input: '' },
      { cardId: 'b', rating: 1, template: 'recognize', input: '答错了' },
      { cardId: 'c', rating: 1, template: 'recognize', input: '', skipped: true },
    ])
    expect(s.skippedCount).toBe(1)
  })

  it('total 是队列长度——分母，别把未作答的题从本轮里抹掉', () => {
    const q = [card('1', 'recognize', {}, {}), card('2', 'cloze', {}, {}), card('3', 'listen', {}, {})]
    // 只答了两张：已答 2 / 共 3，未作答那张仍在本轮里
    expect(roundSummary(q, [{ cardId: '1', rating: 3, template: 'recognize', input: 'x' }, { cardId: '2', rating: 1, template: 'cloze', input: '' }]).total).toBe(3)
  })
})

describe('templateCounts', () => {
  it('按队列统计各题型题数，未出到的题型也占一行（count 为 0）', () => {
    const q = [card('1', 'recognize', {}, {}), card('2', 'recognize', {}, {}), card('3', 'cloze', {}, {})]
    const rows = templateCounts(q)
    expect(rows.find(r => r.template === 'recognize')?.count).toBe(2)
    expect(rows.find(r => r.template === 'cloze')?.count).toBe(1)
    expect(rows.find(r => r.template === 'listen')?.count).toBe(0)
    expect(rows.find(r => r.template === 'recognize')?.label).toBe('认读')
  })

  it('行序跟 TEMPLATE_DIFFICULTY 一致，而不是本文件自己抄一份顺序', () => {
    // 抄一份顺序的话，改动只会静默重排本轮小结：改 template.ts 的人看不到这里。
    expect(templateCounts([]).map(r => r.template)).toEqual(TEMPLATE_DIFFICULTY)
    expect(templateAccuracy([]).map(r => r.template)).toEqual(TEMPLATE_DIFFICULTY)
  })
})

describe('templateAccuracy', () => {
  it('未出到的题型正确率为 null，不是 0', () => {
    // 0% 的意思是「出了但全错」，与「没出」是两件事（spec §4.5）
    const rows = templateAccuracy([{ cardId: 'a', rating: 3, template: 'recognize', input: 'x' }])
    expect(rows.find(r => r.template === 'recognize')?.accuracy).toBe(1)
    expect(rows.find(r => r.template === 'listen')?.accuracy).toBeNull()
  })

  it('出的题全错时正确率是 0，与「没出」区分得开', () => {
    const rows = templateAccuracy([{ cardId: 'a', rating: 1, template: 'cloze', input: 'x' }])
    expect(rows.find(r => r.template === 'cloze')?.accuracy).toBe(0)
  })
})

describe('ratingDistribution / ratingSeries', () => {
  it('三档计数', () => {
    const d = ratingDistribution([
      { cardId: 'a', rating: 1, template: 'recognize', input: '' },
      { cardId: 'b', rating: 2, template: 'recognize', input: 'x' },
      { cardId: 'c', rating: 3, template: 'recognize', input: 'x' },
      { cardId: 'd', rating: 3, template: 'recognize', input: 'x' },
    ])
    expect(d).toEqual({ again: 1, hard: 1, good: 2 })
  })

  it('走势按作答顺序，不是按题型分组', () => {
    expect(ratingSeries([
      { cardId: 'a', rating: 3, template: 'recognize', input: 'x' },
      { cardId: 'b', rating: 1, template: 'recognize', input: 'x' },
      { cardId: 'c', rating: 2, template: 'recognize', input: 'x' },
    ])).toEqual([3, 1, 2])
  })
})

describe('wordLabelFor（Review Focus 4）', () => {
  it('优先取题面的词', () => {
    expect(wordLabelFor(card('1', 'recognize', { lemma: 'diffuse' }, { translation: '散布' }))).toBe('diffuse')
  })

  it('题面无词时取答案里的词', () => {
    expect(wordLabelFor(card('1', 'cloze', { sentence: '____' }, { lemma: 'diffuse' }))).toBe('diffuse')
  })

  it('两处都没有词时取答案释义', () => {
    expect(wordLabelFor(card('1', 'listen', { playAudio: true }, { translation: '散布' }))).toBe('散布')
  })

  it('都没有时回落到 cardId —— 不留空白单元格（Review Focus 4）', () => {
    expect(wordLabelFor(card('zzz', 'listen', { playAudio: true }, {}))).toBe('zzz')
  })

  it('字段存在但是空串时继续往下找，不把空串当结果', () => {
    expect(wordLabelFor(card('zzz', 'recognize', { lemma: '' }, { lemma: '   ', translation: '光' }))).toBe('光')
  })
})

describe('isSkipped', () => {
  it('只认显式标记，不从空串反推', () => {
    expect(isSkipped({ rating: 1, input: '', skipped: true })).toBe(true)
  })

  it('评了「忘了」但没有跳过标记 —— 不算跳过', () => {
    // 本次修复的回归锚点：这条在修复前会是 true。
    // input 是「作答内容」不是「意图」，任何「没打字就评分」的路径都会借用同一个空串。
    expect(isSkipped({ rating: 1, input: '' })).toBe(false)
  })

  it('标记优先于内容', () => {
    expect(isSkipped({ rating: 1, input: '算了', skipped: true })).toBe(true)
    expect(isSkipped({ rating: 2, input: '', skipped: false })).toBe(false)
  })
})

describe('answerDisplay', () => {
  it('三态：跳过 / 未作答 / 作答原文', () => {
    expect(answerDisplay({ input: '', skipped: true })).toBe('（跳过）')
    expect(answerDisplay({ input: '' })).toBe('（未作答）')
    expect(answerDisplay({ input: 'deliberate' })).toBe('deliberate')
  })
})

describe('skippedCount 与 ratingDistribution 的关系', () => {
  it('一条跳过记录同时使 skippedCount +1 且 again +1', () => {
    const answered = [{ cardId: 'c1', rating: 1, template: 'recall' as const, input: '', skipped: true }]
    expect(roundSummary([], answered).skippedCount).toBe(1)
    expect(ratingDistribution(answered).again).toBe(1)
  })
})

describe('correctnessLabel（v0.6.3 条目 17）', () => {
  it('对 / 错 / 未判分三态', () => {
    expect(correctnessLabel(true)).toBe('正确')
    expect(correctnessLabel(false)).toBe('错误')
    expect(correctnessLabel(null)).toBe('—')
  })

  it('判错写「错误」不写「不正确」——两处消费点必须同一份文案', () => {
    expect(correctnessLabel(false)).not.toContain('不正确')
  })
})
