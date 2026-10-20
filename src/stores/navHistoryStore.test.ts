import { describe, it, expect, beforeEach } from 'vitest'
import { useNavHistoryStore, type NavEntryResolver } from './navHistoryStore'
import type { WordLocation } from '../types/word'

const s = () => useNavHistoryStore.getState()

/** 库内现状：id → 模块；null = 已不在库。 */
const resolver = (where: Record<string, WordLocation | null>): NavEntryResolver =>
  id => where[id] ?? null

describe('navHistoryStore', () => {
  beforeEach(() => s().reset())

  it('record 入栈（带模块），goBack / goForward 返回目标词条并移动指针', () => {
    const all = resolver({ a: 'workspace', b: 'workspace', c: 'workspace' })
    s().record('a', 'workspace'); s().record('b', 'workspace'); s().record('c', 'workspace')
    expect(s().goBack(all)).toEqual({ id: 'b', location: 'workspace' })
    expect(s().goBack(all)).toEqual({ id: 'a', location: 'workspace' })
    expect(s().goBack(all)).toBeNull()          // 到头
    expect(s().goForward(all)).toEqual({ id: 'b', location: 'workspace' })
  })

  it('record 相同 id 不重复入栈', () => {
    s().record('a', 'workspace'); s().record('a', 'workspace')
    expect(s().history.entries).toEqual([{ id: 'a', location: 'workspace' }])
  })

  it('跨模块后退 / 前进带回目标所在模块', () => {
    const all = resolver({ w1: 'workspace', a1: 'archive', w2: 'workspace' })
    s().record('w1', 'workspace')
    s().record('a1', 'archive')
    s().record('w2', 'workspace')

    // 工作区 → 储藏库 → 工作区：后退两次应依次落回储藏库与工作区，模块不许丢。
    expect(s().goBack(all)).toEqual({ id: 'a1', location: 'archive' })
    expect(s().goBack(all)).toEqual({ id: 'w1', location: 'workspace' })
    expect(s().goForward(all)).toEqual({ id: 'a1', location: 'archive' })
    expect(s().goForward(all)).toEqual({ id: 'w2', location: 'workspace' })
  })

  it('目标已被删除：丢弃该项并继续朝同方向找，历史里不再留下它', () => {
    const all = resolver({ a: 'workspace', c: 'workspace' })   // b 已删
    s().record('a', 'workspace'); s().record('b', 'workspace'); s().record('c', 'workspace')

    expect(s().goBack(all)).toEqual({ id: 'a', location: 'workspace' })
    expect(s().history.entries).toEqual([
      { id: 'a', location: 'workspace' },
      { id: 'c', location: 'workspace' },
    ])
    expect(s().history.index).toBe(0)
    // 前进分支里也没有 b 了
    expect(s().goForward(all)).toEqual({ id: 'c', location: 'workspace' })
  })

  it('目标已被移到另一个模块：按库内当前位置刷新历史项并返回新模块', () => {
    // 记录时 b 在工作区，之后被移进储藏库。
    const all = resolver({ a: 'workspace', b: 'archive', c: 'workspace' })
    s().record('a', 'workspace'); s().record('b', 'workspace'); s().record('c', 'workspace')

    expect(s().goBack(all)).toEqual({ id: 'b', location: 'archive' })
    expect(s().history.entries[1]).toEqual({ id: 'b', location: 'archive' })
    expect(s().goForward(all)).toEqual({ id: 'c', location: 'workspace' })
    expect(s().goBack(all)).toEqual({ id: 'b', location: 'archive' })
  })

  it('整个方向的目标都失效时返回 null，且无效项被清掉', () => {
    const all = resolver({ c: 'workspace' })   // a、b 都不在库
    s().record('a', 'workspace'); s().record('b', 'workspace'); s().record('c', 'workspace')

    expect(s().goBack(all)).toBeNull()
    expect(s().history.entries).toEqual([{ id: 'c', location: 'workspace' }])
    expect(s().history.index).toBe(0)
  })

  it('dropId 清理记录后回退不落到被删词条', () => {
    const all = resolver({ a: 'workspace', b: 'workspace', c: 'workspace' })
    s().record('a', 'workspace'); s().record('b', 'workspace'); s().record('c', 'workspace')
    s().dropId('b')
    expect(s().history.entries.map(e => e.id)).toEqual(['a', 'c'])
    expect(s().goBack(all)).toEqual({ id: 'a', location: 'workspace' })
  })

  it('reset 回到空栈', () => {
    const all = resolver({ a: 'workspace' })
    s().record('a', 'workspace')
    s().reset()
    expect(s().history.entries).toEqual([])
    expect(s().goBack(all)).toBeNull()
    expect(s().goForward(all)).toBeNull()
  })
})
