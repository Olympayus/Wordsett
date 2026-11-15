import { useEffect, useState } from 'react'
import { resolvePlatform, tabletLayout, type PlatformClass, type PlatformEnv, type TabletLayout } from './platform'
import { SIDEBAR_EXPANDED_WIDTH } from './sidebar'

/**
 * 取当前环境（Task 1 的 `resolvePlatform` 入参）。
 *
 * `isTauri` / `isAndroid` 在手机上都是常量，每次 resize 重算也不会变；`width` / `height` 才是
 * 断点真正依赖的量。抽成模块级函数是为了「环境 → 平台」只有一处转换：hook 的初值与
 * resize 回调若各写一遍 `resolvePlatform({…})`，漏一个字段就会让某个平台静默落错档。
 */
function currentEnv(): PlatformEnv {
  // 断点按**设备最小宽度**判（spec §3.2 的 smallestScreenWidthDp），不用 `innerWidth`：
  // 手机横屏时 `innerWidth` 约 800，会把一台手机判成平板、挂上桌面外壳；而方向锁只在
  // 手机外壳里执行，于是横屏冷启动的手机永远回不到竖屏。`screen` 的两边长取小，旋转不变
  // （`screen` 读不到时退回视口，行为与旧实现一致）。
  const sw = window.screen?.width || window.innerWidth
  const sh = window.screen?.height || window.innerHeight
  return {
    isTauri: '__TAURI_INTERNALS__' in window,
    isAndroid: /Android/i.test(navigator.userAgent),
    width: Math.min(sw, sh),
    height: Math.max(sw, sh),
  }
}

/**
 * 当前设备形态（Android 手机外壳，Task 4）。
 *
 * 初值走惰性 `useState`：脚本加载时就要读一次 UA 与视口，晚一帧（effect 里）再读会让
 * 首帧按错误的形态渲染一次。`IndexPage` 据此决定挂 `MobileShell` 还是 `AppShell`。
 *
 * 监听 `resize` 只为「设备最小宽度真的变了」的场合（分屏、自由窗口、外接屏）：
 * 断点读的是 `screen` 两边取小，**旋转不会越过断点**——一台手机不会因为横过来就被
 * 换成桌面外壳（旧实现用 `innerWidth`，横屏冷启动就会这样）。
 */
export function usePlatformClass(): PlatformClass {
  const [p, setP] = useState<PlatformClass>(() => resolvePlatform(currentEnv()))
  useEffect(() => {
    const onResize = () => setP(resolvePlatform(currentEnv()))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return p
}

/**
 * 非平板形态的布局：不缩放，侧栏就是桌面展开宽度（桌面与手机的既有行为）。
 *
 * 常量对象按引用返回：这个值在非平板上永远不变，state 复用同一份即可。
 */
const NON_TABLET_LAYOUT: TabletLayout = { zoom: 1, sidebarWidth: SIDEBAR_EXPANDED_WIDTH }

/** 按形态取当前布局。只有 `android-tablet` 才读 `innerWidth`（缩放量的是横屏逻辑宽度）。 */
function tabletLayoutNow(platform: PlatformClass): TabletLayout {
  return platform === 'android-tablet' ? tabletLayout(window.innerWidth) : NON_TABLET_LAYOUT
}

/**
 * 平板布局（v0.7.8）：`{ zoom, sidebarWidth }`，只在 `android-tablet` 上有意义。
 *
 * 缩放宿主要跟着窗口变，故订阅 `resize` 与 `orientationchange`——安卓上旋转后
 * `innerWidth` 与 `innerHeight` 对调，`resize` 在部分机型上晚于 `orientationchange`，
 * 两个都听才不会停在旧的一档（`update` 幂等，重复触发只多一次相等比较）。
 *
 * 其他平台返回不缩放 + 桌面侧栏宽，`AppShell` 因此不必在 hook 外再判一次平台。
 */
export function useTabletLayout(): TabletLayout {
  const platform = usePlatformClass()
  const [layout, setLayout] = useState<TabletLayout>(() => tabletLayoutNow(platform))
  useEffect(() => {
    const update = () => setLayout(prev => {
      const next = tabletLayoutNow(platform)
      return prev.zoom === next.zoom && prev.sidebarWidth === next.sidebarWidth ? prev : next
    })
    // 形态变化（分屏 / 自由窗口越过 600 断点）要立刻重算，不能等下一次 resize。
    update()
    if (platform !== 'android-tablet') return
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [platform])
  return layout
}
