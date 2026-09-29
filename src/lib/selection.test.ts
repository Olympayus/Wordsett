import { describe, it, expect } from 'vitest'
import { rangeSelect, selectAll, pruneToRows, selectedWordIdsFromRows } from './selection'

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

// 批量动作入参的推导。这是防「删到看不见的词」的最后一道闸，也是全任务最该被钉住的一处：
// 下面两条分别锁住「不可见的键产不出 id」与「同一个词只算一次」，任一被改坏都会让
// Review Focus 1（筛选后全选再删，只删看得见的那些）失效。
describe('selectedWordIdsFromRows（批量入参）', () => {
  // 形状对齐 WordList 的 ItemRow：行键含组前缀，同一个词在分类模式下可出现在多行里
  const rows = [
    { key: 'cat:a:word1', wordId: 'word1' },
    { key: 'cat:b:word1', wordId: 'word1' },   // 同一个词，第二个分类
    { key: 'cat:b:word2', wordId: 'word2' },
    { key: 'uncat:word3', wordId: 'word3' },
  ]

  it('选中集里混进了当前不可见的键时，它产不出任何 id（守卫的回归锁）', () => {
    const out = selectedWordIdsFromRows(rows, new Set(['cat:a:word1', 'gone:key']))
    expect(out).toEqual(['word1'])
  })

  it('同一个词出现在两个分组下时只产出一个 id（去重锁）', () => {
    const out = selectedWordIdsFromRows(rows, new Set(['cat:a:word1', 'cat:b:word1']))
    expect(out).toEqual(['word1'])
  })

  it('全选当前 3 行 → 2 个 id：行数与词数不等，去重在确认框的数字上生效', () => {
    const visible = rows.slice(0, 3)   // 3 行，但只含 word1 / word2 两个词
    const out = selectedWordIdsFromRows(visible, selectAll(visible.map(r => r.key)))
    expect(visible).toHaveLength(3)
    expect(out.sort()).toEqual(['word1', 'word2'])
  })

  it('当前渲染列表为空时返回空数组（批量动作无入参，直接短路）', () => {
    expect(selectedWordIdsFromRows([], new Set(['cat:a:word1']))).toEqual([])
  })
})
