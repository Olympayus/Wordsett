import { describe, it, expect } from 'vitest'
import { scopeLabel, accuracyText, correctCount, TEMPLATE_LABEL, promptTypeLabel, posNoteText } from './scopeLabel'

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

describe('correctCount（spec §8.1 控制台：正确数 = rating >= 3 计数）', () => {
  it('空数组为 0', () => {
    expect(correctCount([])).toBe(0)
  })

  it('只数 3 分与 4 分，不数 2 分', () => {
    expect(correctCount([{ rating: 2 }, { rating: 3 }, { rating: 4 }])).toBe(2)
  })

  it('全对（全 4 分）与全错（全 1 分）', () => {
    expect(correctCount([{ rating: 4 }, { rating: 4 }])).toBe(2)
    expect(correctCount([{ rating: 1 }, { rating: 1 }])).toBe(0)
  })

  // 上一条并非整组都对两种写法放过：只有「全 1 分 → 0」那半在写成 === 3 时也过，
  // 「全 4 分 → 2」那半在 === 3 下得 0、会挂。这条要的是 4 分单独也得算数
  it('4 分单独计入（=== 3 会漏掉这一条）', () => {
    expect(correctCount([{ rating: 4 }])).toBe(1)
  })
})

describe('TEMPLATE_LABEL 的位置（v0.6.3 条目 2）', () => {
  it('五个题型各有一个非空中文名，且互不相同', () => {
    const keys = ['recognize', 'cloze', 'recall', 'english_def', 'listen'] as const
    const labels = keys.map(k => TEMPLATE_LABEL[k])
    expect(labels.every(v => typeof v === 'string' && v.length > 0)).toBe(true)
    expect(new Set(labels).size).toBe(5)
  })
})

describe('题面文案（v0.6.3 条目 3、18）', () => {
  it('promptTypeLabel 带前缀与全角冒号', () => {
    expect(promptTypeLabel('recognize')).toBe('题型：认读')
    expect(promptTypeLabel('cloze')).toBe('题型：填空')
  })

  it('posNoteText 有值才给括号，空值给空串', () => {
    expect(posNoteText('adj.')).toBe(' (adj.)')
    expect(posNoteText('')).toBe('')
  })

  it('posNoteText 不重复加括号（值本身带括号时原样透传，不叠一层）', () => {
    expect(posNoteText('(n.)')).toBe(' ((n.))')
  })
})
