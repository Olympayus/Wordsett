import { describe, it, expect } from 'vitest'
import {
  roundSummary, templateCounts, templateAccuracy, ratingDistribution, ratingSeries, wordLabelFor,
} from './roundStats'
import type { ReviewCardDTO } from '../../services/reviewService'

const card = (cardId: string, template: ReviewCardDTO['template'], prompt: any, answer: any): ReviewCardDTO =>
  ({ cardId, wordId: `w-${cardId}`, template, prompt, answer, sched: { dueAt: 0, reps: 0, lapses: 0, lastReviewAt: null, mastery: null, rNow: 0 } })

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

  it('跳过＝rating 1 且 input 为空串', () => {
    const s = roundSummary([], [
      { cardId: 'a', rating: 1, template: 'recognize', input: '' },
      { cardId: 'b', rating: 1, template: 'recognize', input: '答错了' },
    ])
    expect(s.skippedCount).toBe(1)
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
