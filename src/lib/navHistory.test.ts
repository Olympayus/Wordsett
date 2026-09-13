import { describe, it, expect } from 'vitest'
import {
  EMPTY_HISTORY, HISTORY_LIMIT, push, back, forward, current,
  canGoBack, canGoForward, removeId,
} from './navHistory'

describe('navHistory 历史栈（浏览器式前进后退）', () => {
  it('空栈：无当前项，两个方向都不可走', () => {
    expect(current(EMPTY_HISTORY)).toBeNull()
    expect(canGoBack(EMPTY_HISTORY)).toBe(false)
    expect(canGoForward(EMPTY_HISTORY)).toBe(false)
  })

  it('push 依次入栈，当前项为最后一个', () => {
    let h = push(EMPTY_HISTORY, 'a')
    h = push(h, 'b')
    h = push(h, 'c')
    expect(h.entries).toEqual(['a', 'b', 'c'])
    expect(h.index).toBe(2)
    expect(current(h)).toBe('c')
  })

  it('push 与当前项相同时不重复入栈', () => {
    let h = push(EMPTY_HISTORY, 'a')
    h = push(h, 'a')
    expect(h.entries).toEqual(['a'])
    expect(h.index).toBe(0)
  })

  it('back 与 forward 逐步移动，到头不越界', () => {
    let h = push(push(push(EMPTY_HISTORY, 'a'), 'b'), 'c')
    h = back(h)
    expect(current(h)).toBe('b')
    h = back(h)
    expect(current(h)).toBe('a')
    h = back(h)
    expect(current(h)).toBe('a')          // 到头保持不动
    expect(canGoBack(h)).toBe(false)
    h = forward(h)
    expect(current(h)).toBe('b')
  })

  it('回退后再 push 会截断前进分支（浏览器行为）', () => {
    let h = push(push(push(EMPTY_HISTORY, 'a'), 'b'), 'c')
    h = back(h)                            // 当前 b，前进分支 c 还在
    h = push(h, 'd')
    expect(h.entries).toEqual(['a', 'b', 'd'])
    expect(h.index).toBe(2)
    expect(canGoForward(h)).toBe(false)
  })

  it('超过上限时丢弃最旧记录，当前项仍指向同一条', () => {
    let h = EMPTY_HISTORY
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) h = push(h, `w${i}`)
    expect(h.entries.length).toBe(HISTORY_LIMIT)
    expect(h.entries[0]).toBe('w5')        // 最旧的 5 条被丢弃
    expect(current(h)).toBe(`w${HISTORY_LIMIT + 4}`)
    expect(h.index).toBe(HISTORY_LIMIT - 1)
  })

  it('removeId 删除当前项之前的记录时，指针跟着左移', () => {
    let h = push(push(push(EMPTY_HISTORY, 'a'), 'b'), 'c')   // index 2 -> c
    h = removeId(h, 'a')
    expect(h.entries).toEqual(['b', 'c'])
    expect(current(h)).toBe('c')           // 仍指向 c
  })

  it('removeId 删除当前项时退到前一条', () => {
    let h = push(push(push(EMPTY_HISTORY, 'a'), 'b'), 'c')   // index 2 -> c
    h = removeId(h, 'c')
    expect(h.entries).toEqual(['a', 'b'])
    expect(current(h)).toBe('b')
  })

  it('removeId 删除不存在的 id 时原样返回', () => {
    const h = push(push(EMPTY_HISTORY, 'a'), 'b')
    expect(removeId(h, 'zzz')).toEqual(h)
  })

  it('removeId 清空最后一条时回到空栈', () => {
    const h = removeId(push(EMPTY_HISTORY, 'a'), 'a')
    expect(h).toEqual(EMPTY_HISTORY)
  })
})
