import { describe, it, expect } from 'vitest'
import { resolvePlatform, usesMobileShell, tabletZoom, tabletLayout, orientationFor, PHONE_MAX_WIDTH, TABLET_MIN_WIDTH } from './platform'

const env = (width: number, isAndroid = true) => ({ isTauri: true, isAndroid, width, height: 844 })

describe('platform', () => {
  it('桌面不进入移动外壳', () => {
    expect(resolvePlatform(env(390, false))).toBe('desktop')
    expect(usesMobileShell('desktop')).toBe(false)
  })
  it('599 及以下是手机，600 起是平板', () => {
    expect(resolvePlatform(env(PHONE_MAX_WIDTH))).toBe('android-phone')
    expect(resolvePlatform(env(TABLET_MIN_WIDTH))).toBe('android-tablet')
  })
  it('只有手机用移动外壳', () => {
    expect(usesMobileShell('android-phone')).toBe(true)
    expect(usesMobileShell('android-tablet')).toBe(false)
  })
  it('平板缩放触底 0.85、参考宽度以上为 1', () => {
    expect(tabletZoom(1024)).toBe(0.85)
    expect(tabletZoom(1246)).toBe(1)
    expect(tabletZoom(1400)).toBe(1)
  })
  it('方向：手机竖屏、平板横屏、桌面不锁定', () => {
    expect(orientationFor('android-phone')).toBe('portrait')
    expect(orientationFor('android-tablet')).toBe('landscape')
    expect(orientationFor('desktop')).toBeNull()
  })
})

describe('tabletLayout', () => {
  it('1024 横屏：缩放触底、侧栏 240', () => {
    expect(tabletLayout(1024)).toEqual({ zoom: 0.85, sidebarWidth: 240 })
  })
  it('1280 横屏：不缩放、侧栏 300', () => {
    expect(tabletLayout(1280)).toEqual({ zoom: 1, sidebarWidth: 300 })
  })
  it('1246 参考宽：不缩放、侧栏 240（未到 1280）', () => {
    expect(tabletLayout(1246)).toEqual({ zoom: 1, sidebarWidth: 240 })
  })
})
