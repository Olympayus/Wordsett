import { describe, it, expect } from 'vitest'
import { answerBarMode } from './answerBar'

describe('answerBarMode（v0.7.6 底栏状态）', () => {
  it('未揭示：空', () => expect(answerBarMode({ revealed: false, answeredNow: false, rated: false })).toBe('none'))
  it('已揭示未评分：三键', () => expect(answerBarMode({ revealed: true, answeredNow: false, rated: false })).toBe('rate'))
  it('已评分待推进：下一题', () => expect(answerBarMode({ revealed: true, answeredNow: true, rated: true })).toBe('next'))
  it('回看态：下一题', () => expect(answerBarMode({ revealed: true, answeredNow: true, rated: false })).toBe('next'))
})
