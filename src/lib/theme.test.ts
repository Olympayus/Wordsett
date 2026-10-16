import { describe, it, expect } from 'vitest'
import { resolveTheme } from './theme'

describe('resolveTheme', () => {
  it('light / dark 直接透传，不看系统', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('light', false)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('dark', true)).toBe('dark')
  })

  it('system 按系统偏好解析成**两个具体值之一**——绝不返回 "system"', () => {
    // 这条是本任务最容易犯的错：把 'system' 直接写进 data-theme，
    // 于是 [data-theme='dark'] 不命中、浅色块也不命中，整页落在浏览器默认色上。
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('system', true)).not.toBe('system')
  })
})
