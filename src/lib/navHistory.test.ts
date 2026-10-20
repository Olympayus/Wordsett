import { describe, it, expect } from 'vitest'
import {
  EMPTY_HISTORY, HISTORY_LIMIT, push, back, forward, current,
  canGoBack, canGoForward, removeId, type NavEntry, type NavHistory,
} from './navHistory'

const e = (id: string, location: 'workspace' | 'archive' = 'workspace'): NavEntry => ({ id, location })
const pushAll = (entries: NavEntry[]): NavHistory => entries.reduce((h, entry) => push(h, entry), EMPTY_HISTORY)

describe('navHistory 历史栈（浏览器式前进后退）', () => {
  it('空栈：无当前项，两个方向都不可走', () => {
    expect(current(EMPTY_HISTORY)).toBeNull()
    expect(canGoBack(EMPTY_HISTORY)).toBe(false)
    expect(canGoForward(EMPTY_HISTORY)).toBe(false)
  })

  it('push 依次入栈，当前项为最后一个（模块随词条一起记）', () => {
    let h = push(EMPTY_HISTORY, e('a'))
    h = push(h, e('b', 'archive'))
    h = push(h, e('c'))
    expect(h.entries).toEqual([e('a'), e('b', 'archive'), e('c')])
    expect(h.index).toBe(2)
    expect(current(h)).toEqual(e('c'))
  })

  it('push 与当前项相同时不重复入栈', () => {
    const h = push(push(EMPTY_HISTORY, e('a')), e('a'))
    expect(h.entries).toEqual([e('a')])
    expect(h.index).toBe(0)
  })

  it('同一词条换了模块：就地更新当前项的 location，不新增一项', () => {
    let h = push(EMPTY_HISTORY, e('a'))
    h = push(h, e('a', 'archive'))
    expect(h.entries).toEqual([e('a', 'archive')])
    expect(h.index).toBe(0)
  })

  it('back 与 forward 逐步移动，到头不越界', () => {
    let h = pushAll([e('a'), e('b', 'archive'), e('c')])
    h = back(h)
    expect(current(h)).toEqual(e('b', 'archive'))
    h = back(h)
    expect(current(h)).toEqual(e('a'))
    h = back(h)
    expect(current(h)).toEqual(e('a'))     // 到头保持不动
    expect(canGoBack(h)).toBe(false)
    h = forward(h)
    expect(current(h)).toEqual(e('b', 'archive'))
  })

  it('回退后再 push 会截断前进分支（浏览器行为）', () => {
    let h = pushAll([e('a'), e('b'), e('c')])
    h = back(h)                            // 当前 b，前进分支 c 还在
    h = push(h, e('d'))
    expect(h.entries).toEqual([e('a'), e('b'), e('d')])
    expect(h.index).toBe(2)
    expect(canGoForward(h)).toBe(false)
  })

  it('超过上限时丢弃最旧记录，当前项仍指向同一条', () => {
    let h = EMPTY_HISTORY
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) h = push(h, e(`w${i}`))
    expect(h.entries.length).toBe(HISTORY_LIMIT)
    expect(h.entries[0].id).toBe('w5')     // 最旧的 5 条被丢弃
    expect(current(h)?.id).toBe(`w${HISTORY_LIMIT + 4}`)
    expect(h.index).toBe(HISTORY_LIMIT - 1)
  })

  it('removeId 删除当前项之前的记录时，指针跟着左移', () => {
    let h = pushAll([e('a'), e('b'), e('c')])   // index 2 -> c
    h = removeId(h, 'a')
    expect(h.entries).toEqual([e('b'), e('c')])
    expect(current(h)?.id).toBe('c')           // 仍指向 c
  })

  it('removeId 删除当前项时退到前一条', () => {
    let h = pushAll([e('a'), e('b'), e('c')])   // index 2 -> c
    h = removeId(h, 'c')
    expect(h.entries).toEqual([e('a'), e('b')])
    expect(current(h)?.id).toBe('b')
  })

  it('removeId 删除不存在的 id 时原样返回', () => {
    const h = pushAll([e('a'), e('b')])
    expect(removeId(h, 'zzz')).toEqual(h)
  })

  it('removeId 清空最后一条时回到空栈', () => {
    const h = removeId(push(EMPTY_HISTORY, e('a')), 'a')
    expect(h).toEqual(EMPTY_HISTORY)
  })
})
