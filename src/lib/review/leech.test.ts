import { describe, it, expect } from 'vitest'
import { isLeech, leechTooltip } from './leech'

describe('leech', () => {
  it('严格口径：只认 lapses 达阈值，不看窗口内错过', () => {
    // 徽标用严格 Leech（01 §3.6）。薄弱词专项页用的是「∪ 近 7 天 rating=1」的宽口径，
    // 两者刻意不同——用宽口径会让近 7 天错过一次的词全挂上徽标，徽标就烂了。
    expect(isLeech(3, 4)).toBe(false)
    expect(isLeech(4, 4)).toBe(true)
    expect(isLeech(5, 4)).toBe(true)
  })

  it('阈值 0 时不把每个词都判成顽固词', () => {
    // 阈值可调为 0（设置页允许），此时语义应是「关掉」，而不是「全部命中」。
    expect(isLeech(0, 0)).toBe(false)
    expect(isLeech(1, 0)).toBe(false)
  })

  it('tooltip 文案', () => {
    expect(leechTooltip(5)).toBe('连错 5 次')
  })
})
