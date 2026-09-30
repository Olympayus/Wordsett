import { describe, it, expect } from 'vitest'
import { fieldPaneLeftBar } from './WordWorkbench'

const NEUTRAL = '3px solid var(--color-border-strong)'

describe('fieldPaneLeftBar（v0.6.5 §4.7：来源差异只在编者模式现形）', () => {
  it('普通模式：辨析组与词性窗格同一个中性色', () => {
    expect(fieldPaneLeftBar({ isPosPane: false, isGroupPane: true, editorMode: false, state: 'personal' })).toBe(NEUTRAL)
    expect(fieldPaneLeftBar({ isPosPane: true, isGroupPane: false, editorMode: false, state: 'original' })).toBe(NEUTRAL)
  })

  it('编者模式：辨析组按来源三态上色——个人是橙调', () => {
    expect(fieldPaneLeftBar({ isPosPane: false, isGroupPane: true, editorMode: true, state: 'personal' }))
      .toBe('3px solid var(--color-weave-personal)')
  })

  it('编者模式：词典来源的组仍是中性', () => {
    expect(fieldPaneLeftBar({ isPosPane: false, isGroupPane: true, editorMode: true, state: 'original' }))
      .toBe('3px solid var(--color-weave-original)')
  })

  it('词性窗格在任何模式下都是中性——它不参与来源三态', () => {
    expect(fieldPaneLeftBar({ isPosPane: true, isGroupPane: false, editorMode: true, state: 'personal' })).toBe(NEUTRAL)
  })
})
