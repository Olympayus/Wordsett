import { describe, it, expect } from 'vitest'
import {
  categoryLocationCounts,
  locationCountSegments,
  locationCountsText,
} from './categoryCounts'

describe('locationCountsText（v0.7.5 Task 14：分类读数分模块）', () => {
  it('工作区独有 / 储藏库独有 / 两模块都有：三态都并排给出两个数', () => {
    expect(locationCountsText(3, 0)).toBe('工作区:3 储藏库:0')
    expect(locationCountsText(0, 5)).toBe('工作区:0 储藏库:5')
    expect(locationCountsText(2, 4)).toBe('工作区:2 储藏库:4')
  })

  it('分段把两个数字单独给出，供组件套 .stat-num 而不用解析字符串', () => {
    const segs = locationCountSegments(2, 4)
    // 数字段可被组件识别，且只有两个
    expect(segs.filter(s => s.stat).map(s => s.text)).toEqual(['2', '4'])
    // 纯函数与分段版本是同一个口径，不会各说各话
    expect(segs.map(s => s.text).join('')).toBe(locationCountsText(2, 4))
  })
})

describe('categoryLocationCounts', () => {
  const locationOf = (entries: [string, 'workspace' | 'archive'][]) => new Map(entries)

  it('同一分类下的词按 location 分栏计数', () => {
    const map = { w1: ['c1'], w2: ['c1'], w3: ['c1'] }
    const counts = categoryLocationCounts(map, locationOf([
      ['w1', 'workspace'], ['w2', 'workspace'], ['w3', 'archive'],
    ]))
    expect(counts.get('c1')).toEqual({ workspace: 2, archive: 1 })
  })

  it('一词多分类时每个分类各记一份（与既有「N 词」口径一致）', () => {
    const counts = categoryLocationCounts({ w1: ['c1', 'c2'] }, locationOf([['w1', 'archive']]))
    expect(counts.get('c1')).toEqual({ workspace: 0, archive: 1 })
    expect(counts.get('c2')).toEqual({ workspace: 0, archive: 1 })
  })

  it('没有出现在位置表里的词不计入任何一侧（不猜成工作区）', () => {
    const counts = categoryLocationCounts(
      { w1: ['c1'], missing: ['c1'] },
      locationOf([['w1', 'workspace']]),
    )
    expect(counts.get('c1')).toEqual({ workspace: 1, archive: 0 })
  })

  it('没有任何词映射的分类不出现在结果里（组件回落 0:0）', () => {
    expect(categoryLocationCounts({}, locationOf([])).get('c1')).toBeUndefined()
  })
})
