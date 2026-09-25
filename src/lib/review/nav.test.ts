import { describe, it, expect } from 'vitest'
import { currentAnswered, canGoBack, canGoForward, answeredCount } from './nav'

const q = (n: number) => Array.from({ length: n }, (_, i) => ({ cardId: `c${i + 1}` }))
const ans = (...ids: string[]) => ids.map(cardId => ({ cardId }))

describe('lib/review/nav', () => {
  it('第 1 题不能后退', () => {
    expect(canGoBack(0)).toBe(false)
    expect(canGoBack(1)).toBe(true)
  })

  it('单题队列两个方向都到不了', () => {
    expect(canGoBack(0)).toBe(false)
    expect(canGoForward(q(1), ans('c1'), 0)).toBe(false)
  })

  it('新会话开场（一道未答）右箭头置灰', () => {
    expect(canGoForward(q(5), [], 0)).toBe(false)
  })

  it('停在未作答的当前题上右箭头置灰——不越界偷看后面的题', () => {
    // 已答集合永远是队列前缀。答了 c1（k = 1），当前是第 2 题（index 1）
    expect(canGoForward(q(5), ans('c1'), 1)).toBe(false)
  })

  it('从历史往回翻时右箭头可用，能一路翻回当前题（不困死）', () => {
    // 答了 c1 c2 c3（k = 3），当前是第 4 题（index 3）；用户翻回第 2 题（index 1）
    const answered = ans('c1', 'c2', 'c3')
    expect(canGoForward(q(5), answered, 1)).toBe(true)
    expect(canGoForward(q(5), answered, 2)).toBe(true)   // 再一步即回到当前题
    expect(canGoForward(q(5), answered, 3)).toBe(false)  // 已站在当前题上，不能再往右
  })

  it('刚评分完（当前卡已答）右箭头可用，可推进到下一题', () => {
    expect(canGoForward(q(5), ans('c1'), 0)).toBe(true)
  })

  it('已在最后一题时不能前进', () => {
    expect(canGoForward(q(3), ans('c1', 'c2', 'c3'), 2)).toBe(false)
  })

  it('currentAnswered：当前题的卡已答过即为真', () => {
    expect(currentAnswered(q(3), ans('c1'), 0)).toBe(true)
    expect(currentAnswered(q(3), ans('c1'), 1)).toBe(false)
  })

  it('answeredCount 是已答条目数', () => {
    expect(answeredCount(ans('c1', 'c2'))).toBe(2)
    expect(answeredCount([])).toBe(0)
  })
})
