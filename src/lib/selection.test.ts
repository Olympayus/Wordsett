import { describe, it, expect } from 'vitest'
import { rangeSelect, selectAll, pruneToRows } from './selection'

const ROWS = ['cat:w1:a', 'cat:w1:b', 'cat:w2:a', 'cat:w2:b', 'uncat:c']

describe('rangeSelect（Shift 范围选）', () => {
  it('锚到目标之间的行全部加入，含两端', () => {
    const out = rangeSelect(ROWS, ROWS[1], ROWS[3], new Set())
    expect([...out].sort()).toEqual([ROWS[1], ROWS[2], ROWS[3]].sort())
  })

  it('跨分组头也照样连成一段——行键里含组前缀，但范围只按数组顺序算', () => {
    const out = rangeSelect(ROWS, ROWS[0], ROWS[4], new Set())
    expect(out.size).toBe(5)
  })

  it('反向拉范围与正向等价', () => {
    const down = rangeSelect(ROWS, ROWS[1], ROWS[4], new Set())
    const up = rangeSelect(ROWS, ROWS[4], ROWS[1], new Set())
    expect([...down].sort()).toEqual([...up].sort())
  })

  it('只做并集，不清掉此前已选中的项', () => {
    const out = rangeSelect(ROWS, ROWS[0], ROWS[1], new Set(['uncat:c']))
    expect(out.has('uncat:c')).toBe(true)
    expect(out.size).toBe(3)
  })

  it('没有锚（首次点击）时退化成单点切换', () => {
    const out = rangeSelect(ROWS, null, ROWS[2], new Set(['cat:w1:a']))
    expect([...out].sort()).toEqual([ROWS[2], 'cat:w1:a'].sort())
  })

  it('锚已不在当前列表里（筛选把它滤掉了）时也退化成单点切换', () => {
    const out = rangeSelect(ROWS, 'gone:key', ROWS[2], new Set())
    expect([...out]).toEqual([ROWS[2]])
  })
})

describe('selectAll', () => {
  it('只选传进来的行——作用域是当前渲染的行，不是全库', () => {
    expect(selectAll(['a', 'b']).size).toBe(2)
    expect(selectAll([]).size).toBe(0)
  })
})

describe('pruneToRows', () => {
  it('把已不在当前列表里的键剔掉', () => {
    const out = pruneToRows(new Set(['a', 'gone']), ['a', 'b'])
    expect([...out]).toEqual(['a'])
  })

  it('没有变化时返回原 Set 实例（避免无谓的重渲染）', () => {
    const s = new Set(['a'])
    expect(pruneToRows(s, ['a', 'b'])).toBe(s)
  })

  it('列表清空时选中集也清空', () => {
    expect(pruneToRows(new Set(['a']), []).size).toBe(0)
  })
})
