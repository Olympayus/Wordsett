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

describe('选项判色的驱动值（v0.6.2 条目 11）', () => {
  /**
   * AnswerInput 用 `revealedInput !== undefined` 决定是否着对错色（AnswerInput.tsx:42）。
   * 故「点完选项立刻着色」等价于「提交后立即给出一个非 undefined 的 revealedInput」。
   * 这里把 ReviewArena 的取值规则抽出来钉住：它在两种场景下都必须给出有值的结果。
   */
  const revealedInputFor = (
    revealed: boolean, lastInput: string, pastInput: string | undefined,
  ): string | undefined => (revealed ? lastInput : pastInput)

  it('刚提交（revealed 为真、pastInput 未定义）时立刻有值 —— 选项即刻着色', () => {
    expect(revealedInputFor(true, '散布，扩散', undefined)).toBe('散布，扩散')
  })

  it('跳过路径（提交空串）时也是「已揭示」—— 着色并标出正确答案', () => {
    expect(revealedInputFor(true, '', undefined)).toBe('')
    // 关键：'' !== undefined，AnswerInput 的 shown 判据要的正是这个差别
    expect(revealedInputFor(true, '', undefined) !== undefined).toBe(true)
  })

  it('回看旧题时回放当时的作答原文', () => {
    expect(revealedInputFor(true, '无关', 'implication')).toBe('无关')
  })

  it('未揭示时不传 —— 保持橙色的「待选」形态', () => {
    expect(revealedInputFor(false, '', undefined)).toBeUndefined()
  })
})
