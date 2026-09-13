import { describe, it, expect, beforeEach } from 'vitest'
import { useNavHistoryStore } from './navHistoryStore'

const s = () => useNavHistoryStore.getState()

describe('navHistoryStore', () => {
  beforeEach(() => s().reset())

  it('record 入栈，goBack / goForward 返回目标词条 id 并移动指针', () => {
    s().record('a'); s().record('b'); s().record('c')
    expect(s().goBack()).toBe('b')
    expect(s().goBack()).toBe('a')
    expect(s().goBack()).toBeNull()          // 到头
    expect(s().goForward()).toBe('b')
  })

  it('record 相同 id 不重复入栈', () => {
    s().record('a'); s().record('a')
    expect(s().history.entries).toEqual(['a'])
  })

  it('dropId 清理记录后回退不落到被删词条', () => {
    s().record('a'); s().record('b'); s().record('c')
    s().dropId('b')
    expect(s().history.entries).toEqual(['a', 'c'])
    expect(s().goBack()).toBe('a')
  })

  it('reset 回到空栈', () => {
    s().record('a')
    s().reset()
    expect(s().history.entries).toEqual([])
    expect(s().goBack()).toBeNull()
    expect(s().goForward()).toBeNull()
  })
})