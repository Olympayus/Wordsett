import { describe, it, expect } from 'vitest'
import type { PlatformClass } from './platform'
import { SETTINGS_SECTIONS, visibleSettingsSections } from './mobileSettings'

describe('visibleSettingsSections', () => {
  it('android 没有平台权限', () => {
    expect(visibleSettingsSections('android-phone').map(s => s.key))
      .toEqual(['general', 'search', 'review', 'voice', 'category', 'links', 'about'])
  })
  it('桌面保留平台权限', () => {
    expect(visibleSettingsSections('desktop').map(s => s.key)).toContain('platform')
  })
  // v0.7.10 Task 10：平台权限是桌面（macOS）独有，平板复用桌面外壳但同样没有这一项。
  it('tablet hides platform section', () => {
    expect(visibleSettingsSections('android-tablet').map(s => s.key)).not.toContain('platform')
  })
  // v0.7.9 Task 16：划词只在桌面出现——Android 手机与平板都不出这一项。
  it('android 手机与平板都没有划词分区', () => {
    expect(visibleSettingsSections('android-phone').map(s => s.key)).not.toContain('collect')
    expect(visibleSettingsSections('android-tablet').map(s => s.key)).not.toContain('collect')
  })
  // v0.8.0 Task 8：iOS 与 Android 同判——手机与平板都剔除划词与平台权限。
  it('iOS 手机与平板剔除划词与平台权限', () => {
    const keys = (p: PlatformClass) => visibleSettingsSections(p).map(s => s.key)
    expect(keys('ios-phone')).not.toContain('collect')
    expect(keys('ios-phone')).not.toContain('platform')
    expect(keys('ios-tablet')).not.toContain('collect')
  })
  it('划词分区紧跟双向链接（桌面顺序）', () => {
    const keys = SETTINGS_SECTIONS.map(s => s.key)
    expect(keys.indexOf('collect')).toBe(keys.indexOf('links') + 1)
    expect(visibleSettingsSections('desktop').map(s => s.key)).toContain('collect')
  })
})
