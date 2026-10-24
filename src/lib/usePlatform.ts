import { useEffect, useState } from 'react'
import { resolvePlatform, type PlatformClass, type PlatformEnv } from './platform'

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
