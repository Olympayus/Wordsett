import { describe, it, expect } from 'vitest'
import {
  resolvePlatform,
  usesMobileShell,
  usesTabletLayout,
  hasTouchSemantics,
  isMobileOS,
  isIOS,
  isAndroid,
  isDesktop,
  isAndroidTablet,
  isIOSUserAgent,
  tabletZoom,
  tabletLayout,
  orientationFor,
  PHONE_MAX_WIDTH,
  TABLET_MIN_WIDTH,
  IOS_TABLET_NARROW_WINDOW,
  type PlatformEnv,
} from './platform'

const env = (width: number, opts: Partial<PlatformEnv> = {}): PlatformEnv => ({
  isTauri: true,
  isAndroid: false,
  isIOS: false,
  width,
  height: 1024,
  windowWidth: width,
  ...opts,
})

describe('platform', () => {
  it('桌面不进入移动外壳', () => {
    expect(resolvePlatform(env(390))).toBe('desktop')
    expect(usesMobileShell('desktop')).toBe(false)
  })
  it('599 及以下是手机，600 起是平板', () => {
    expect(resolvePlatform(env(PHONE_MAX_WIDTH, { isAndroid: true }))).toBe('android-phone')
    expect(resolvePlatform(env(TABLET_MIN_WIDTH, { isAndroid: true }))).toBe('android-tablet')
  })
  it('只有手机用移动外壳', () => {
    expect(usesMobileShell('android-phone')).toBe(true)
    expect(usesMobileShell('android-tablet')).toBe(false)
  })
  it('只有 Android 平板注册返回栈', () => {
    expect(isAndroidTablet('android-tablet')).toBe(true)
    expect(isAndroidTablet('android-phone')).toBe(false)
    expect(isAndroidTablet('desktop')).toBe(false)
  })
  it('只有桌面渲染窗口控制与拖拽区', () => {
    expect(isDesktop('desktop')).toBe(true)
    expect(isDesktop('android-tablet')).toBe(false)
    expect(isDesktop('android-phone')).toBe(false)
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

describe('iOS 与五档谓词', () => {
  it('iOS 按最小边分手机 / 平板', () => {
    expect(resolvePlatform(env(390, { isIOS: true }))).toBe('ios-phone')
    expect(resolvePlatform(env(820, { isIOS: true }))).toBe('ios-tablet')
  })
  it('iPad 窄窗回落手机外壳', () => {
    expect(IOS_TABLET_NARROW_WINDOW).toBe(600)
    expect(resolvePlatform(env(820, { isIOS: true, windowWidth: 599 }))).toBe('ios-phone')
    expect(resolvePlatform(env(820, { isIOS: true, windowWidth: 600 }))).toBe('ios-tablet')
  })
  it('Android 不受 windowWidth 影响', () => {
    expect(resolvePlatform(env(800, { isAndroid: true, windowWidth: 390 }))).toBe('android-tablet')
  })
  it('谓词覆盖五档', () => {
    for (const p of ['ios-phone', 'android-phone'] as const) {
      expect(usesMobileShell(p)).toBe(true)
      expect(usesTabletLayout(p)).toBe(false)
      expect(hasTouchSemantics(p)).toBe(false)
    }
    for (const p of ['ios-tablet', 'android-tablet'] as const) {
      expect(usesMobileShell(p)).toBe(false)
      expect(usesTabletLayout(p)).toBe(true)
      expect(hasTouchSemantics(p)).toBe(true)
    }
    expect(isIOS('ios-phone')).toBe(true)
    expect(isIOS('ios-tablet')).toBe(true)
    expect(isIOS('android-phone')).toBe(false)
    expect(isIOS('desktop')).toBe(false)
    expect(isAndroid('android-phone')).toBe(true)
    expect(isAndroid('android-tablet')).toBe(true)
    expect(isAndroid('ios-phone')).toBe(false)
    expect(isMobileOS('desktop')).toBe(false)
    expect(isMobileOS('ios-phone')).toBe(true)
    expect(isMobileOS('android-tablet')).toBe(true)
    expect(isDesktop('ios-tablet')).toBe(false)
  })
  it('iPad 桌面 UA 兜底', () => {
    expect(isIOSUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true)
    expect(isIOSUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false)
    expect(isIOSUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)', 5)).toBe(true)
  })
  it('方向', () => {
    expect(orientationFor('ios-phone')).toBe('portrait')
    expect(orientationFor('ios-tablet')).toBe('landscape')
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
