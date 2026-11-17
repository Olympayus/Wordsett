import { describe, it, expect } from 'vitest'
import { hideMobileTabBar } from './mobileTabBar'

describe('hideMobileTabBar（v0.7.6 复习沉浸态）', () => {
  it('复习会话进行中隐藏', () => expect(hideMobileTabBar('review', 'answering', 'today', false)).toBe(true))
  it('已评待推进也隐藏', () => expect(hideMobileTabBar('review', 'rated', 'today', false)).toBe(true))
  it('复习概览不隐藏', () => expect(hideMobileTabBar('review', 'overview', null, false)).toBe(false))
  it('结算不隐藏', () => expect(hideMobileTabBar('review', 'summary', 'today', false)).toBe(false))
  it('其它模块不隐藏', () => expect(hideMobileTabBar('workbench', 'answering', 'today', false)).toBe(false))
  it('会话归属为空时不隐藏', () => expect(hideMobileTabBar('review', 'answering', null, false)).toBe(false))

  it('词典详情打开时隐藏底栏', () => {
    expect(hideMobileTabBar('workbench', 'overview', null, true)).toBe(true)
    expect(hideMobileTabBar('search', 'overview', null, true)).toBe(true)
    expect(hideMobileTabBar('workbench', 'overview', null, false)).toBe(false)
  })
})
