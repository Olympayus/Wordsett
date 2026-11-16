import { describe, it, expect } from 'vitest'
import { dueLine, dueStatusFrom } from './dueLine'

const DAY = 86400000

describe('dueLine', () => {
  it('due_line_covers_four_states', () => {
    expect(dueLine({ kind: 'overdue', days: 2 })).toBe('已逾期 2 天')
    expect(dueLine({ kind: 'dueToday', cards: 3 })).toBe('今日到期 · 到期卡 3 张')
    expect(dueLine({ kind: 'upcoming', days: 5 })).toBe('5 天后到期')
    expect(dueLine({ kind: 'none' })).toBe('尚无复习计划')
    expect(dueLine({ kind: 'archived' })).toBe('储藏库 · 不参与复习')
  })
})

describe('dueStatusFrom', () => {
  it('uses_earliest_unsuspended_card_and_ignores_suspended', () => {
    const now = new Date('2026-11-16T12:00:00').getTime()
    expect(dueStatusFrom([{ dueAt: now - 2 * DAY, suspended: false }, { dueAt: now - 9 * DAY, suspended: true }], now, 'workspace'))
      .toEqual({ kind: 'overdue', days: 2 })
  })

  it('archived_words_are_archived_regardless_of_rows', () => {
    expect(dueStatusFrom([{ dueAt: 0, suspended: false }], 0, 'archive')).toEqual({ kind: 'archived' })
  })

  it('due_today_counts_unsuspended_cards_before_next_local_midnight', () => {
    const now = new Date('2026-11-16T12:00:00').getTime()
    expect(dueStatusFrom([
      { dueAt: now, suspended: false },
      { dueAt: now + 3 * 3600000, suspended: false },
      { dueAt: now + 1 * 3600000, suspended: true },
    ], now, 'workspace')).toEqual({ kind: 'dueToday', cards: 2 })
  })

  it('same_day_past_due_is_due_today_not_overdue_zero', () => {
    const now = new Date(2026, 10, 16, 15, 0, 0).getTime()
    const dueAt = new Date(2026, 10, 16, 11, 0, 0).getTime()
    expect(dueStatusFrom([{ dueAt, suspended: false }], now, 'workspace'))
      .toEqual({ kind: 'dueToday', cards: 1 })
  })

  it('upcoming_uses_local_day_distance', () => {
    const now = new Date('2026-11-16T12:00:00').getTime()
    expect(dueStatusFrom([{ dueAt: now + 5 * DAY, suspended: false }], now, 'workspace'))
      .toEqual({ kind: 'upcoming', days: 5 })
    // 次日 0 点整已是「明天」而不是「今日」。
    const nextMidnight = new Date(2026, 10, 17, 0, 0, 0).getTime()
    expect(dueStatusFrom([{ dueAt: nextMidnight, suspended: false }], now, 'workspace'))
      .toEqual({ kind: 'upcoming', days: 1 })
  })

  it('no_rows_or_all_suspended_is_none', () => {
    const now = new Date('2026-11-16T12:00:00').getTime()
    expect(dueStatusFrom([], now, 'workspace')).toEqual({ kind: 'none' })
    expect(dueStatusFrom([{ dueAt: now - DAY, suspended: true }], now, 'workspace')).toEqual({ kind: 'none' })
    // location 为 null（词典页等尚不知道归属的调用）按工作区处理。
    expect(dueStatusFrom([], now, null)).toEqual({ kind: 'none' })
  })

  it('overdue_days_cross_local_midnights_not_24h_blocks', () => {
    const now = new Date(2026, 10, 16, 0, 30, 0).getTime()
    const dueAt = new Date(2026, 10, 15, 1, 0, 0).getTime() // 不足 24 小时，但已跨一个本地午夜
    expect(dueStatusFrom([{ dueAt, suspended: false }], now, 'workspace'))
      .toEqual({ kind: 'overdue', days: 1 })
  })
})
