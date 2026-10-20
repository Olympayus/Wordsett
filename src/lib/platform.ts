/**
 * 平台判定与缩放（Android 手机外壳，Task 1）。
 *
 * 全站唯一的「这台设备长什么样」出处：`IndexPage` 只在 `android-phone` 时挂 `MobileShell`，
 * 桌面与平板都继续挂 `AppShell`（平板是**桌面外壳 + 缩小一档**，不是第三套界面）。
 * 抽成纯函数是为了能在 node 环境里钉住断点与缩放。
 */

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

/** 平板缩放：参考宽度以下为 `width / TABLET_REFERENCE_WIDTH`，夹在 `TABLET_MIN_ZOOM` 与 1 之间。 */
export function tabletZoom(width: number): number {
  return Math.min(Math.max(width / TABLET_REFERENCE_WIDTH, TABLET_MIN_ZOOM), 1)
}

/** 方向锁定：手机竖屏、平板横屏、桌面不锁定（返回 null）。 */
export function orientationFor(p: PlatformClass): 'portrait' | 'landscape' | null {
  if (p === 'android-phone') return 'portrait'
  if (p === 'android-tablet') return 'landscape'
  return null
}
