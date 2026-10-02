import { describe, expect, it } from 'vitest'
import { closePatch } from './config'

describe('closePatch', () => {
  it('两个按钮都写「已确认」标记', () => {
    expect(closePatch(true).window.close_dialog_seen).toBe(true)
    expect(closePatch(false).window.close_dialog_seen).toBe(true)
  })

  it('主按钮 = 最小化到托盘，次按钮 = 直接退出', () => {
    expect(closePatch(true).window.close_to_tray).toBe(true)
    expect(closePatch(false).window.close_to_tray).toBe(false)
  })

  it('只带 window 一组键，不顺手改别的配置', () => {
    expect(Object.keys(closePatch(true))).toEqual(['window'])
  })
})