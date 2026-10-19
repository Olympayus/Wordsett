import { describe, it, expect } from 'vitest'
import { collectedLabel, libraryLocationIn, libraryLocationOf } from './collected'
import type { WordLocation } from '../types/word'

describe('libraryLocationIn（Map 形态，v0.7.5 Task 13）', () => {
  const index = new Map<string, WordLocation>([
    ['abandon', 'workspace'],
    ['forsake', 'archive'],
  ])

  it('按索引的归一化键命中两个模块', () => {
    expect(libraryLocationIn(index, 'abandon')).toBe('workspace')
    expect(libraryLocationIn(index, 'forsake')).toBe('archive')
  })

  it('入参大小写/首尾空白归一化后命中；不在库或空串回落 null', () => {
    expect(libraryLocationIn(index, '  Abandon ')).toBe('workspace')
    expect(libraryLocationIn(index, 'FORSAKE')).toBe('archive')
    expect(libraryLocationIn(index, 'unknown')).toBeNull()
    expect(libraryLocationIn(index, '')).toBeNull()
    expect(libraryLocationIn(index, '   ')).toBeNull()
  })
})

describe('collectedLabel（v0.7.5 Task 13）', () => {
  it('标识文案按模块分', () => {
    expect(collectedLabel('workspace')).toBe('已在工作台')
    expect(collectedLabel('archive')).toBe('已在储藏库')
    expect(collectedLabel(null)).toBeNull()
  })
})

describe('libraryLocationOf（纯函数，v0.7.5 Task 9）', () => {
  const ws = [{ normalizedLemma: 'abandon', location: 'workspace' as const }]
  const ar = [{ normalizedLemma: 'forsake', location: 'archive' as const }]

  it('已收录判定区分工作台与储藏库', () => {
    expect(libraryLocationOf('abandon', [...ws, ...ar])).toBe('workspace')
    expect(libraryLocationOf('FORSAKE', [...ws, ...ar])).toBe('archive')
    expect(libraryLocationOf('unknown', [...ws, ...ar])).toBeNull()
  })

  it('入参大小写/首尾空白归一化后命中；空串回落 null', () => {
    expect(libraryLocationOf('  Abandon ', [...ws, ...ar])).toBe('workspace')
    expect(libraryLocationOf('', [...ws, ...ar])).toBeNull()
    expect(libraryLocationOf('   ', [...ws, ...ar])).toBeNull()
  })
})
