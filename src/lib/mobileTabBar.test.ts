import { describe, it, expect } from 'vitest'
import { hideMobileTabBar } from './mobileTabBar'

describe('hideMobileTabBar（v0.7.6 复习沉浸态）', () => {
  it('复习会话进行中隐藏', () => expect(hideMobileTabBar('review', 'answering', 'today')).toBe(true))
  it('已评待推进也隐藏', () => expect(hideMobileTabBar('review', 'rated', 'today')).toBe(true))
  it('复习概览不隐藏', () => expect(hideMobileTabBar('review', 'overview', null)).toBe(false))
  it('结算不隐藏', () => expect(hideMobileTabBar('review', 'summary', 'today')).toBe(false))
  it('其它模块不隐藏', () => expect(hideMobileTabBar('workbench', 'answering', 'today')).toBe(false))
  it('会话归属为空时不隐藏', () => expect(hideMobileTabBar('review', 'answering', null)).toBe(false))
})
