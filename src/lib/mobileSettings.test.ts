import { describe, it, expect } from 'vitest'
import { visibleSettingsSections } from './mobileSettings'

describe('visibleSettingsSections', () => {
  it('android 没有平台权限', () => {
    expect(visibleSettingsSections('android-phone').map(s => s.key))
      .toEqual(['general', 'search', 'review', 'voice', 'category', 'links', 'about'])
  })
  it('桌面保留平台权限', () => {
    expect(visibleSettingsSections('desktop').map(s => s.key)).toContain('platform')
  })
})
