import { describe, it, expect } from 'vitest'
import { dayTotal, dayAccuracy, isTrendSparse, subtitleFor, periodFor, splitCaptionNumbers, shortDay, type DayRating, type RoundStatsInput } from './trend'

const day = (again: number, hard: number, good: number): DayRating => ({ day: '2026-09-25', again, hard, good })

describe('lib/review/trend', () => {
  it('复习量＝again + hard + good（rating 4 已由数据层折进 good）', () => {
    expect(dayTotal(day(1, 2, 3))).toBe(6)
    expect(dayTotal(day(0, 0, 0))).toBe(0)
  })

  it('正确率＝good / 总数，与 templateAccuracy 的「rating ≥ 3 算对」同口径', () => {
    // good 3 / 总 6 = 0.5。hard（rating 2）不计入分子——与 templateAccuracy 一样只看 rating ≥ 3。
    expect(dayAccuracy(day(1, 2, 3))).toBeCloseTo(0.5)
    expect(dayAccuracy(day(0, 0, 4))).toBe(1)     // 全记得
    expect(dayAccuracy(day(4, 0, 0))).toBe(0)     // 全忘了
    // 全 hard + 全 again 都不算对
    expect(dayAccuracy(day(2, 2, 0))).toBe(0)
  })

  it('正确率在无评分的空日不除零', () => {
    expect(dayAccuracy(day(0, 0, 0))).toBe(0)
  })

  it('稀疏判定与 StatsMini 一致：样本 < 3 天且无到期压力才占位', () => {
    const noDue = [0, 0, 0, 0, 0, 0, 0, 0]
    // 两个活跃日 + 无到期：三图与趋势条都判稀疏，不该一个画曲线一个写「数据积累中」
    expect(isTrendSparse([day(1, 0, 0), day(0, 0, 1)], noDue)).toBe(true)
    // 样本满 3 天 → 不稀疏
    expect(isTrendSparse([day(1, 0, 0), day(0, 0, 1), day(0, 1, 0)], noDue)).toBe(false)
    // 样本不足但有到期压力 → 不稀疏（有东西可看）
    expect(isTrendSparse([day(1, 0, 0)], [0, 3, 0, 0, 0, 0, 0, 0])).toBe(false)
    // 空库 → 稀疏
    expect(isTrendSparse([], noDue)).toBe(true)
  })
})

describe('四宫格卡片的补充文字（v0.6.2 条目 9）', () => {
  const stats: RoundStatsInput = {
    masteryBuckets: [10, 20, 30, 40, 50, 60],        // 六档（档 0 无记录 + 1–5），合计 210
    dueByDay: [0, 5, 22, 17, 9, 5, 3, 1],           // 第 0 天是今天
    recentRatings: [
      { day: 'd1', again: 1, hard: 2, good: 3 },    // 6 张
      { day: 'd2', again: 0, hard: 1, good: 5 },    // 6 张
    ],
  }

  it('熟知度分布卡报出总词数与两段计数', () => {
    const s = subtitleFor('mastery', stats)
    // v0.6.3 条目 7：三段并列，全角空格分隔（不是 · 也不是普通空格）
    // 熟悉及以上 = 索引 2 及以上 = 30+40+50+60 = 180；档 0（无记录 10）与档 1（陌生 20）被排除。
    expect(s).toBe('全库词汇数: 210　熟悉及以上: 180　熟悉度: 86%')
  })

  it('明日压力卡报出合计张数与峰值', () => {
    const s = subtitleFor('due', stats)
    expect(s).toBe('共 62 张，峰值在第 2 天')   // 5+22+17+9+5+3+1=62，不含今天的 0（brief 写的 78 是笔误）；峰值 22 在 dueByDay 的索引 2
  })

  it('趋势卡报出合计与平均正确率', () => {
    const s = subtitleFor('trend', stats)
    expect(s).toBe('合计: 12 张 · 平均正确率: 67%')   // 6 + 6；加权正确率 = 8 good / 12 = 66.7% → 67%
  })

  it('评分卡报出合计与加权均值', () => {
    const s = subtitleFor('rating', stats)
    // 加权 = Σ(good + hard×0.5) / Σ(again+hard+good)
    //       = (3+2×0.5 + 5+1×0.5) / 12 = 9.5/12 = 0.7916… → 0.8
    expect(s).toBe('合计 12 张，均值 0.8')
    // v0.6.3 条目 7：「满分 1」不再是卡底文案——量表说明搬去了 RatingSpark 的 aria-label，
    // 卡底只留合计与均值两个数。
  })

  it('均值是 0–1 量表上的期望评分：again 记 0、hard 记 0.5、good 记 1', () => {
    const onlyAgain: RoundStatsInput = { ...stats, recentRatings: [{ day: 'x', again: 4, hard: 0, good: 0 }] }
    const onlyHard: RoundStatsInput = { ...stats, recentRatings: [{ day: 'x', again: 0, hard: 4, good: 0 }] }
    const onlyGood: RoundStatsInput = { ...stats, recentRatings: [{ day: 'x', again: 0, hard: 0, good: 4 }] }
    expect(subtitleFor('rating', onlyAgain)).toContain('均值 0.0')
    expect(subtitleFor('rating', onlyHard)).toContain('均值 0.5')
    expect(subtitleFor('rating', onlyGood)).toContain('均值 1.0')
    // hard 记 0.5 而非 1，所以掺了 hard 就到不了满量表：5 good + 5 hard = (5+2.5)/10 = 0.75 → 0.8
    const mixed: RoundStatsInput = { ...stats, recentRatings: [{ day: 'x', again: 0, hard: 5, good: 5 }] }
    expect(subtitleFor('rating', mixed)).toContain('均值 0.8')
  })

  it('均值不随最忙的那天变化（分母是量表，不是峰值日）', () => {
    // 两天：d1 全 again（4 张，0 分），d2 全 good（16 张，满分）。合计 20 张、分子 16 → 0.8。
    // 图上 d2 是唯一的峰且顶满纵轴；但若分母错用峰值日（16），会算成 16/16 = 1.0——本断言钉住的就是这里。
    const small: RoundStatsInput = {
      ...stats,
      recentRatings: [{ day: 'd1', again: 4, hard: 0, good: 0 }, { day: 'd2', again: 0, hard: 0, good: 16 }],
    }
    expect(subtitleFor('rating', small)).toContain('均值 0.8')

    // 两天的成分各自等比放大 3 倍：峰值日 16 → 48 张，图上的相对高度与纵轴刻度全变，
    // 文字仍是 0.8。分母若跟着峰值走，这里会变成 48/48 = 1.0。
    const scaled: RoundStatsInput = {
      ...stats,
      recentRatings: [{ day: 'd1', again: 12, hard: 0, good: 0 }, { day: 'd2', again: 0, hard: 0, good: 48 }],
    }
    expect(subtitleFor('rating', scaled)).toContain('均值 0.8')
  })

  it('全部为空时不抛异常，给「数据积累中」这类兜底文案', () => {
    const empty: RoundStatsInput = { masteryBuckets: [], dueByDay: [], recentRatings: [] }
    for (const k of ['rating', 'due', 'mastery', 'trend'] as const) {
      expect(() => subtitleFor(k, empty)).not.toThrow()
      expect(subtitleFor(k, empty).length).toBeGreaterThan(0)
    }
  })
})

// 卡片清单在 StatsMini.tsx 的 CARDS 里（标题、kind、图三者同处一条记录）。
// 这里照抄那份 kind 顺序与各自的区分片段：StatsMini 里的对调会静默渲染（编译、类型、
// lint 全过，只在卡面写错数字），所以把「每个 kind 说的是自己那张卡的话」钉在这里。
// 纯数据断言，不需要 DOM 或组件测试环境。
describe('卡片标题与 subtitleFor 的 kind 一一对应（防对调）', () => {
  const stats: RoundStatsInput = {
    masteryBuckets: [10, 20, 30, 40, 50, 60],
    dueByDay: [0, 5, 22, 17, 9, 5, 3, 1],
    recentRatings: [
      { day: 'd1', again: 1, hard: 2, good: 3 },
      { day: 'd2', again: 0, hard: 1, good: 5 },
    ],
  }

  // 与 StatsMini 的 CARDS 同序；frag 是只有该 kind 才会产出的片段
  // （v0.6.3 条目 7：rating 的区分片段随「近 14 天评分走势」一起搬到了 periodFor，
  //  卡底那条线上它已无痕迹，所以这里改用同一条线上独有的「均值」）
  const CARDS = [
    { kind: 'rating', frag: '均值' },
    { kind: 'due', frag: '峰值在第' },
    { kind: 'mastery', frag: '全库词汇数' },
    { kind: 'trend', frag: '平均正确率' },
  ] as const

  it('每个 kind 产出自己那张卡的文案，互不串台', () => {
    for (const c of CARDS) {
      const s = subtitleFor(c.kind, stats)
      expect(s, `${c.kind} 的文案里没有「${c.frag}」`).toContain(c.frag)
      // 别的卡片的片段不该出现在这一张上（区分片段互不相同，逐个排除）
      for (const other of CARDS) {
        if (other.kind === c.kind) continue
        expect(s, `${c.kind} 的文案里混进了 ${other.kind} 的片段「${other.frag}」`).not.toContain(other.frag)
      }
    }
  })

  it('四个 kind 恰好覆盖四张卡，不重不漏', () => {
    expect(CARDS.map(c => c.kind)).toEqual(['rating', 'due', 'mastery', 'trend'])
    expect(new Set(CARDS.map(c => c.kind)).size).toBe(4)
  })
})

describe('periodFor（v0.6.3 条目 7）', () => {
  it('逐项取值', () => {
    expect(periodFor('rating')).toBe('近 14 天评分走势')
    expect(periodFor('due')).toBe('未来 7 天到期')
    expect(periodFor('mastery')).toBe('')
    expect(periodFor('trend')).toBe('近 14 天')
  })

  it('四个值互不相同（空串也算一个不同值）——与 CARDS 的四个 kind 一一对上', () => {
    const kinds = ['rating', 'due', 'mastery', 'trend'] as const
    expect(new Set(kinds.map(periodFor)).size).toBe(4)
  })
})

describe('splitCaptionNumbers（v0.6.3 条目 7 的数字包 stat-num）', () => {
  it('把数字段与文字段交替切出来', () => {
    expect(splitCaptionNumbers('合计 17 张，均值 2.3')).toEqual([
      { text: '合计 ', isNum: false },
      { text: '17', isNum: true },
      { text: ' 张，均值 ', isNum: false },
      { text: '2.3', isNum: true },
    ])
  })

  it('百分数整个算数字段', () => {
    expect(splitCaptionNumbers('正确率 88%')).toEqual([
      { text: '正确率 ', isNum: false },
      { text: '88%', isNum: true },
    ])
  })

  it('没有数字时整段是文字', () => {
    expect(splitCaptionNumbers('全库还没有词')).toEqual([{ text: '全库还没有词', isNum: false }])
  })

  it('空串切出空数组（调用方据此不渲染）', () => {
    expect(splitCaptionNumbers('')).toEqual([])
  })
})

describe('shortDay（v0.6.3 条目 7 的时间轴端点刻度）', () => {
  it('db 给的 YYYY-MM-DD 截成 spec §7.4 的 MM-DD', () => {
    // db/review.ts 的 date(…, 'localtime') 产出 10 字符，这里取末五位
    expect(shortDay('2026-09-14')).toBe('09-14')
    expect(shortDay('2026-08-27')).toBe('08-27')
  })

  it('已经是短形态就原样返回（不重复截断成 -14-）', () => {
    expect(shortDay('08-27')).toBe('08-27')
  })

  it('空值退成空串——刻度退化成没有，不显示 - 或 NaN', () => {
    expect(shortDay('')).toBe('')
    expect(shortDay(undefined)).toBe('')
  })
})
