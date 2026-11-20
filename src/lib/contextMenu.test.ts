import { describe, it, expect } from 'vitest'
import { shouldSkipContextMenu } from './contextMenu'

describe('shouldSkipContextMenu（v0.8.0 Task 12 WKWebView 文本手势隔离）', () => {
  it('移动形态放行输入框的系统菜单', () => {
    expect(shouldSkipContextMenu('ios-phone', 'INPUT')).toBe(true)
    expect(shouldSkipContextMenu('android-phone', 'TEXTAREA')).toBe(true)
  })
  it('非输入框与桌面照旧拦截', () => {
    expect(shouldSkipContextMenu('ios-phone', 'DIV')).toBe(false)
    expect(shouldSkipContextMenu('desktop', 'INPUT')).toBe(false)
  })
})
