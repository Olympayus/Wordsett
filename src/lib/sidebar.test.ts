import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  groupByLetter, groupByCategory, fitCollapsedWidth,
  SIDEBAR_ROW_HEIGHT, SIDEBAR_ROW_HEIGHT_COLLAPSED,
} from './sidebar'
import type { WordWithPreview } from '../types/word'
import type { Category } from '../types/category'

const mk = (id: string, lemma: string): WordWithPreview => ({
  id, lemma, normalizedLemma: lemma.toLowerCase(), language: 'en', createdAt: 0, updatedAt: 0,
})

describe('sidebar 分组', () => {
  it('groupByLetter 按首字母分组并排序', () => {
    const groups = groupByLetter([mk('1', 'apple'), mk('2', 'Banana'), mk('3', 'cherry'), mk('4', '123')])
    expect(groups.map(g => g.letter)).toEqual(['1', 'A', 'B', 'C'])
    expect(groups[1].words.map(w => w.lemma)).toEqual(['apple'])
  })

  it('groupByCategory 多分类单词在各分组引用、未分类在底部', () => {
    const words = [mk('w1', 'observe'), mk('w2', 'apple'), mk('w3', 'run')]
    const cats = [
      { id: 'c1', name: '医学', color: '#6B8E7F' },
      { id: 'c2', name: 'GRE', color: '#4A6FA5' },
    ] as Category[]
    const groups = groupByCategory(words, { w1: ['c1', 'c2'], w2: ['c1'] }, cats)
    expect(groups.map(g => g.category?.name ?? '未分类')).toEqual(['医学', 'GRE', '未分类'])
    expect(groups[0].words.map(w => w.id)).toEqual(['w1', 'w2'])
    expect(groups[1].words.map(w => w.id)).toEqual(['w1'])
    expect(groups[2].words.map(w => w.id)).toEqual(['w3'])
  })

  it('groupByCategory 空分类组不返回', () => {
    const cats = [{ id: 'c1', name: '医学', color: '#6B8E7F' }] as Category[]
    const groups = groupByCategory([mk('w1', 'run')], {}, cats)
    expect(groups).toHaveLength(1)
    expect(groups[0].category).toBeNull()
  })
})

describe('sidebar 收起宽度（D1）', () => {
  it('fitCollapsedWidth clamp 到 120-240', () => {
    expect(fitCollapsedWidth(0, 40)).toBe(120)
    expect(fitCollapsedWidth(90, 40)).toBe(130)
    expect(fitCollapsedWidth(300, 40)).toBe(240)
  })
})

describe('sidebar 行高常量（v0.7.2）', () => {
  it('行高常量在 40–52 之间（44 是设计值，回落位是 48–52）', () => {
    expect(SIDEBAR_ROW_HEIGHT).toBeGreaterThanOrEqual(40)
    expect(SIDEBAR_ROW_HEIGHT).toBeLessThanOrEqual(52)
  })

  it('收起态行高不变（32）', () => {
    expect(SIDEBAR_ROW_HEIGHT_COLLAPSED).toBe(32)
  })

  it('虚拟列表的估算高度引用常量，不再写死 76 / 32（防止两处分家）', () => {
    const src = readFileSync(new URL('../components/layout/WordList.tsx', import.meta.url), 'utf8')
    expect(src).toContain('SIDEBAR_ROW_HEIGHT')
    expect(src).not.toMatch(/collapsed\s*\?\s*32\s*:\s*76/)
  })
})
