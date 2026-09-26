import { describe, it, expect } from 'vitest'
import { scopeLabel, accuracyText } from './scopeLabel'

describe('scopeLabel（v0.6.2 条目 15 / 17）', () => {
  it('今日复习策略', () => {
    expect(scopeLabel('today', null)).toBe('今日复习')
  })

  it('自由练习的四个范围各有其名', () => {
    expect(scopeLabel('free', 'category')).toBe('分类强化')
    expect(scopeLabel('free', 'weak')).toBe('薄弱词专项')
    expect(scopeLabel('free', 'today')).toBe('今日队列重练')
    expect(scopeLabel('free', 'random')).toBe('全库随机')
  })

  it('自由练习但还没选范围时给泛称', () => {
    expect(scopeLabel('free', null)).toBe('自由练习')
  })

  it('今日复习策略不理会 scope（它没有范围）', () => {
    expect(scopeLabel('today', 'random')).toBe('今日复习')
  })
})

describe('accuracyText（Review Focus 2）', () => {
  it('已答 0 题显示 —，不是 0%', () => {
    expect(accuracyText(0, 0)).toBe('—')
  })

  it('常规取整', () => {
    expect(accuracyText(10, 7)).toBe('70%')
    expect(accuracyText(3, 2)).toBe('67%')
  })

  it('全对显示 100%', () => {
    expect(accuracyText(5, 5)).toBe('100%')
  })
})
