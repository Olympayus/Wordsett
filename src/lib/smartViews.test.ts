import { describe, it, expect } from 'vitest'
import { filterBySmartView, smartViewCount, visibleSmartViews, WEEK_MS } from './smartViews'
import type { SmartViewInput } from './smartViews'
import type { WordWithPreview } from '../types/word'

const NOW = 1_700_000_000_000
const w = (id: string, createdAt: number): WordWithPreview => ({
  id, lemma: id, normalizedLemma: id, language: 'en', createdAt, updatedAt: createdAt,
})
const WORDS = [w('w1', NOW - 1000), w('w2', NOW - 2 * 86_400_000), w('w3', NOW - 10 * 86_400_000)]

const input = (o: Partial<SmartViewInput> = {}): SmartViewInput => ({
  words: WORDS,
  dueWordIds: new Set(['w3']),
  overlay: {
    w3: { maxLapses: 5, weakestStability: 3, familiarity: 1 },
    w2: { maxLapses: 1, weakestStability: 40, familiarity: 2 },
  },
  leechThreshold: 4,
  now: NOW,
  ...o,
})

describe('四视图筛选口径（v0.6.5 §4.4）', () => {
  it('完整词库：不过滤', () => {
    expect(filterBySmartView(WORDS, 'all', input()).map(x => x.id)).toEqual(['w1', 'w2', 'w3'])
    expect(smartViewCount('all', input())).toBe(3)
  })

  it('复习到期：只看 dueWordIds，与到期卡数无关（视图用词）', () => {
    expect(filterBySmartView(WORDS, 'due', input()).map(x => x.id)).toEqual(['w3'])
    expect(smartViewCount('due', input())).toBe(1)
  })

  it('本周新增：滚动 7 天，不是自然周', () => {
    expect(filterBySmartView(WORDS, 'weekNew', input()).map(x => x.id)).toEqual(['w1', 'w2'])
    const exactly7 = input({ words: [w('w9', NOW - WEEK_MS)] })
    expect(smartViewCount('weekNew', exactly7)).toBe(1)
    const justOver = input({ words: [w('w9', NOW - WEEK_MS - 1)] })
    expect(smartViewCount('weekNew', justOver)).toBe(0)
  })

  it('顽固词：阈值 0 视为关掉，视图恒空（沿用 isLeech 既有语义）', () => {
    expect(filterBySmartView(WORDS, 'leech', input()).map(x => x.id)).toEqual(['w3'])
    expect(smartViewCount('leech', input({ leechThreshold: 0 }))).toBe(0)
  })

  it('没有 overlay 记录的词不会被误判成顽固词', () => {
    expect(filterBySmartView(WORDS, 'leech', input()).some(x => x.id === 'w1')).toBe(false)
  })
})

describe('visibleSmartViews', () => {
  it('完整词库恒可见，其余按开关', () => {
    expect(visibleSmartViews({ all: true, due: true, weekNew: true, leech: true }))
      .toEqual(['all', 'due', 'weekNew', 'leech'])
    expect(visibleSmartViews({ all: true, due: false, weekNew: true, leech: false }))
      .toEqual(['all', 'weekNew'])
  })
})
