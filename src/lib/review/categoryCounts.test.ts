import { describe, it, expect } from 'vitest'
import { aggregateCategoryCounts, canStartFreeScope, freeScopeSummaryText, selectByCategories } from './categoryCounts'

const cats = [
  { id: 'c1', name: '四级核心' },
  { id: 'c2', name: '阅读生词' },
  { id: 'c3', name: '写作替换' },
]
// wordId → categoryIds
const map = { w1: ['c1'], w2: ['c1', 'c2'], w3: ['c2'], w4: [], w5: ['c1'] }
// 有候选（到期）的词
const due = new Set(['w1', 'w2', 'w3'])

describe('aggregateCategoryCounts（v0.6.2 条目 10）', () => {
  it('词数按映射计，待复习数只数在 due 集里的', () => {
    const rows = aggregateCategoryCounts(cats, map, due)
    expect(rows.find(r => r.id === 'c1')).toMatchObject({ wordCount: 3, dueCount: 2 })  // w1 w2 w5 / w1 w2
    expect(rows.find(r => r.id === 'c2')).toMatchObject({ wordCount: 2, dueCount: 2 })  // w2 w3 / w2 w3
    expect(rows.find(r => r.id === 'c3')).toMatchObject({ wordCount: 0, dueCount: 0 })
  })

  it('没有任何分类的词不影响任何一行（w4 不在计数里）', () => {
    const rows = aggregateCategoryCounts(cats, map, due)
    expect(rows.reduce((n, r) => n + r.wordCount, 0)).toBe(5)   // 3 + 2 + 0
  })

  it('保持传入的 categories 顺序', () => {
    expect(aggregateCategoryCounts(cats, map, due).map(r => r.id)).toEqual(['c1', 'c2', 'c3'])
  })

  it('空输入不抛异常', () => {
    expect(aggregateCategoryCounts([], {}, new Set())).toEqual([])
    expect(aggregateCategoryCounts(cats, {}, new Set()).every(r => r.wordCount === 0)).toBe(true)
  })
})

describe('canStartFreeScope（Review Focus 3）', () => {  it('分类强化未勾选任何分类时不能开始', () => {
    expect(canStartFreeScope('category', [])).toBe(false)
  })

  it('分类强化勾了至少一个就能开始', () => {
    expect(canStartFreeScope('category', ['c1'])).toBe(true)
  })

  it('其余三个范围没有前置', () => {
    for (const k of ['random', 'today', 'weak'] as const) {
      expect(canStartFreeScope(k, [])).toBe(true)
    }
  })
})

describe('selectByCategories（spec §8.1：FreeScope 多分类）', () => {
  // 候选池（wordId）取自 getAllCandidates 的结果，未到期但已熟的词也在内
  const pool = ['w1', 'w2', 'w3', 'w4', 'w5']

  it('并集出题：属于任一所选分类的词都进，同一个词不会因跨分类而重复', () => {
    // w2 同时属于 c1 与 c2 —— 只该出一张卡
    expect(selectByCategories(pool, ['c1', 'c2'], map)).toEqual(['w1', 'w2', 'w3', 'w5'])
  })

  it('空选区返回空数组：「没选」不等于「全选」', () => {
    // fail-closed：不能掉到 'random' 那条路把整库交出去（这是 filterFree 的判据）
    expect(selectByCategories(pool, [], map)).toEqual([])
  })

  it('单元素与旧的 categoryId 等价', () => {
    expect(selectByCategories(pool, ['c1'], map)).toEqual(['w1', 'w2', 'w5'])
  })

  it('没勾中的分类一个词都不出；未归类的词（w4）本来就不出', () => {
    expect(selectByCategories(pool, ['c3'], map)).toEqual([])
    expect(selectByCategories(pool, ['c1'], map)).not.toContain('w4')
  })

  it('映射里没有的分类 id 不炸，按未命中处理', () => {
    expect(selectByCategories(pool, ['不存在'], map)).toEqual([])
  })

  it('空候选池不抛异常', () => {
    expect(selectByCategories([], ['c1'], map)).toEqual([])
    expect(selectByCategories(pool, ['c1'], {})).toEqual([])
  })

  it('保持候选池的原有顺序', () => {
    expect(selectByCategories(['w3', 'w1', 'w2'], ['c1', 'c2'], map)).toEqual(['w3', 'w1', 'w2'])
  })
})

describe('freeScopeSummaryText：汇总句必须点明口径（v0.6.2 条目 10）', () => {
  const countRows = [
    { id: 'c1', name: '四级核心', wordCount: 3, dueCount: 2 },
    { id: 'c2', name: '阅读生词', wordCount: 2, dueCount: 1 },
    { id: 'c3', name: '写作替换', wordCount: 0, dueCount: 0 },
  ]

  it('句子里带着「已到期」这个口径，不是裸的「预计可出 N 题」', () => {
    const text = freeScopeSummaryText(['c1'], countRows)
    expect(text).toContain('预计可出（已到期）')
    // 少一个口径括号就退回「对用户许了个假承诺」的状态，故直接钉住整句
    expect(text).toBe('共选 1 个分类 · 预计可出（已到期）2 题')
  })

  it('有词但没到期的分类：M 是 0，而句子仍然成立（闸门看的是词数，不是 M）', () => {
    // 这正是页面上会出现「已到期 0 题 + 按钮可用」的那一格。文案不许把它读成「没有题」。
    const text = freeScopeSummaryText(['c3'], countRows)
    expect(text).toBe('共选 1 个分类 · 预计可出（已到期）0 题')
    expect(text).toContain('已到期')
  })

  it('只累加勾中的分类，且累加的是待复习数', () => {
    expect(freeScopeSummaryText(['c1', 'c2'], countRows))
      .toBe('共选 2 个分类 · 预计可出（已到期）3 题')
    // 没勾的分类不进和
    expect(freeScopeSummaryText(['c1'], countRows)).not.toContain('3 题')
  })

  it('一个都没勾：句子照样给出口径，不是空串', () => {
    expect(freeScopeSummaryText([], countRows)).toBe('共选 0 个分类 · 预计可出（已到期）0 题')
  })
})
