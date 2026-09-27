import { describe, it, expect } from 'vitest'
import { dueChipModel } from './DueBadge'

describe('dueChipModel（v0.6.3 条目 5）', () => {
  it('设置关掉时不给模型（chip 不渲染）', () => {
    expect(dueChipModel(12, false)).toBeNull()
  })

  it('count = 0 时不给模型——两个业务条件（本来没有 / 已经全做完）都落到这一个数上', () => {
    expect(dueChipModel(0, true)).toBeNull()
  })

  it('1–20 走档 1（深暖棕 + 中性描边）', () => {
    const m = dueChipModel(1, true)!
    expect(m.tier).toBe('t1')
    expect(m.numColor).toBe('var(--color-warm-deep)')
    expect(m.style.borderRadius).toBe(12)
    expect(dueChipModel(20, true)!.tier).toBe('t1')
  })

  it('21 起走档 2（暖橙 + 暖橙描边）', () => {
    const m = dueChipModel(21, true)!
    expect(m.tier).toBe('t2')
    expect(m.numColor).toBe('var(--color-accent)')
    expect(dueChipModel(999, true)!.tier).toBe('t2')
  })

  it('两档的字号相同——变了 chip 会在两档间跳动', () => {
    const a = dueChipModel(12, true)!
    const b = dueChipModel(63, true)!
    expect(a.style.fontSize).toBe(b.style.fontSize)
    expect(a.style.height).toBe(b.style.height)
  })

  it('窗口说明按档换', () => {
    expect(dueChipModel(12, true)!.windowNote).not.toBe(dueChipModel(63, true)!.windowNote)
  })
})
