import { describe, it, expect } from 'vitest'
import { startButtonState, type FreeScopeSelection } from './startButton'
import type { FreeScopeKind } from './types'

const sel = (kind: FreeScopeKind, ids: string[] = []): FreeScopeSelection => ({ kind, categoryIds: ids, limit: 20 })

describe('startButtonState（v0.7.10 §7.7 左栏开始按钮三态）', () => {
  it('today_disabled_when_nothing_due', () => {
    expect(startButtonState({ strategy: 'today', live: false, deliverable: 0, wordCount: 10, free: sel('random') }))
      .toEqual({ visible: true, label: '开始复习', disabled: true, reason: '今天没有待复习的词' })
  })

  it('free_category_requires_selection', () => {
    const s = startButtonState({ strategy: 'free', live: false, deliverable: 5, wordCount: 10, free: sel('category') })
    expect(s.disabled).toBe(true)
    expect(s.reason).toBe('至少勾选一个分类')
  })

  it('hidden_when_live', () => {
    expect(startButtonState({ strategy: 'free', live: true, deliverable: 5, wordCount: 10, free: sel('random') }).visible).toBe(false)
    // 会话进行中两个策略都隐藏，今日复习也不例外
    expect(startButtonState({ strategy: 'today', live: true, deliverable: 5, wordCount: 10, free: sel('random') }).visible).toBe(false)
  })

  // 以下为按规则补足的用例：原因优先级与可用态（brief 只给了三条，规则里还有这些分支）。

  it('today_enabled_has_no_reason', () => {
    expect(startButtonState({ strategy: 'today', live: false, deliverable: 3, wordCount: 10, free: sel('random') }))
      .toEqual({ visible: true, label: '开始复习', disabled: false, reason: null })
  })

  it('free_empty_library_wins_over_missing_categories', () => {
    // 词库为空是更前置的原因：分类一个都没勾也会先报「词库为空」，而不是让人去勾一个空库里的分类。
    expect(startButtonState({ strategy: 'free', live: false, deliverable: 0, wordCount: 0, free: sel('category') }))
      .toEqual({ visible: true, label: '开始练习', disabled: true, reason: '词库为空' })
    expect(startButtonState({ strategy: 'free', live: false, deliverable: 5, wordCount: 0, free: sel('random') }).reason)
      .toBe('词库为空')
  })

  it('free_category_with_selection_enabled', () => {
    expect(startButtonState({ strategy: 'free', live: false, deliverable: 0, wordCount: 10, free: sel('category', ['c1']) }))
      .toEqual({ visible: true, label: '开始练习', disabled: false, reason: null })
  })

  it('free_random_enabled_has_no_reason', () => {
    expect(startButtonState({ strategy: 'free', live: false, deliverable: 0, wordCount: 10, free: sel('random') }))
      .toEqual({ visible: true, label: '开始练习', disabled: false, reason: null })
  })

  it('free_other_kinds_follow_the_same_rule', () => {
    // today / weak 没有「未勾选」前置，词库非空即可开始。
    expect(startButtonState({ strategy: 'free', live: false, deliverable: 0, wordCount: 3, free: sel('today') }).disabled).toBe(false)
    expect(startButtonState({ strategy: 'free', live: false, deliverable: 0, wordCount: 3, free: sel('weak') }).disabled).toBe(false)
  })
})
