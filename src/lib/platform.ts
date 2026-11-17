/**
 * 平台判定与缩放（Android 手机外壳，Task 1）。
 *
 * 全站唯一的「这台设备长什么样」出处：`IndexPage` 只在 `android-phone` 时挂 `MobileShell`，
 * 桌面与平板都继续挂 `AppShell`（平板是**桌面外壳 + 缩小一档**，不是第三套界面）。
 * 抽成纯函数是为了能在 node 环境里钉住断点与缩放。
 */

import { SIDEBAR_EXPANDED_WIDTH } from './sidebar'

/** 手机外壳的宽度上界（px，含）。599 及以下走手机外壳。 */
export const PHONE_MAX_WIDTH = 599

/** 平板的宽度下界（px，含）。600 起走平板。 */
export const TABLET_MIN_WIDTH = 600

/** 平板缩放不再放大的参考宽度（px）。 */
export const TABLET_REFERENCE_WIDTH = 1246

/** 平板缩放的下限：1024dp 横屏缩到 0.85 后按钮仍可点。 */
export const TABLET_MIN_ZOOM = 0.85

export type PlatformClass = 'desktop' | 'android-phone' | 'android-tablet'

/** `resolvePlatform` 的输入。`isTauri` / `isAndroid` 由调用点从环境取（见 Task 4 的 `usePlatformClass`）。 */
export interface PlatformEnv {
  isTauri: boolean
  isAndroid: boolean
  width: number
  height: number
}

/** 非 Android 一律 `desktop`；Android 按宽度在 600 处分手机 / 平板。 */
export function resolvePlatform(env: PlatformEnv): PlatformClass {
  if (!env.isAndroid) return 'desktop'
  return env.width < TABLET_MIN_WIDTH ? 'android-phone' : 'android-tablet'
}

/** 只有手机走移动外壳（平板复用桌面外壳，桌面也是）。 */
export function usesMobileShell(p: PlatformClass): boolean {
  return p === 'android-phone'
}

/**
 * 只有 Android 平板注册返回栈（v0.7.10）：手机在 `MobileShell` 里注册，桌面没有返回键。
 * 与 `usesMobileShell` 分开命名——「用哪套外壳」与「要不要接系统返回」是两件事，
 * 将来若手机外壳换了承载方式，这里的判据不该跟着变。
 */
export function isAndroidTablet(p: PlatformClass): boolean {
  return p === 'android-tablet'
}

/**
 * 只有桌面有可拖的窗口（v0.7.10）：自绘标题栏的拖动区与最小化 / 最大化还原 / 关闭
 * 三枚按钮只在桌面渲染。平板复用桌面外壳，但窗口不归用户拖拽、也没有窗口控件可点。
 * 手机外壳不渲染 `TopBar`，判据在那里不参与。
 */
export function isDesktop(p: PlatformClass): boolean {
  return p === 'desktop'
}

/** 平板缩放：参考宽度以下为 `width / TABLET_REFERENCE_WIDTH`，夹在 `TABLET_MIN_ZOOM` 与 1 之间。 */
export function tabletZoom(width: number): number {
  return Math.min(Math.max(width / TABLET_REFERENCE_WIDTH, TABLET_MIN_ZOOM), 1)
}

/** 平板侧栏宽档的分界（px，含）：1280 起才回到桌面展开宽度。 */
export const TABLET_WIDE_SIDEBAR_MIN_WIDTH = 1280

/** 平板窄档侧栏宽度（px）：1024 横屏下把省下的 60px 让给正文。 */
export const TABLET_SIDEBAR_WIDTH_NARROW = 240

/** 平板下三栏布局的两个派生量（`IndexPage` 的缩放宿主与 `AppShell` 的侧栏共用一个判据）。 */
export interface TabletLayout {
  zoom: number
  sidebarWidth: number
}

/**
 * 平板布局：缩放复用 `tabletZoom`，侧栏宽度按横屏宽度分两档。
 *
 * 侧栏 1280 的判据**不随缩放放大**——宽度量的是缩放前的逻辑宽度（`window.innerWidth`），
 * 与 `tabletZoom` 的入参同源；1280 及以上正文已经够宽，侧栏回到桌面的 300，窄档收 60px。
 */
export function tabletLayout(landscapeWidth: number): TabletLayout {
  return {
    zoom: tabletZoom(landscapeWidth),
    sidebarWidth: landscapeWidth >= TABLET_WIDE_SIDEBAR_MIN_WIDTH ? SIDEBAR_EXPANDED_WIDTH : TABLET_SIDEBAR_WIDTH_NARROW,
  }
}

/** 方向锁定：手机竖屏、平板横屏、桌面不锁定（返回 null）。 */
export function orientationFor(p: PlatformClass): 'portrait' | 'landscape' | null {
  if (p === 'android-phone') return 'portrait'
  if (p === 'android-tablet') return 'landscape'
  return null
}
