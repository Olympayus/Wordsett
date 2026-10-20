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
  return {
    isTauri: '__TAURI_INTERNALS__' in window,
    isAndroid: /Android/i.test(navigator.userAgent),
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

/**
 * 当前设备形态（Android 手机外壳，Task 4）。
 *
 * 初值走惰性 `useState`：脚本加载时就要读一次 UA 与视口，晚一帧（effect 里）再读会让
 * 首帧按错误的形态渲染一次。`IndexPage` 据此决定挂 `MobileShell` 还是 `AppShell`。
 *
 * 只监听 `resize`：Android 上旋转、分屏、键盘弹出都会改视口宽度，而**手机形态是宽度驱动**的
 * （见 `lib/platform.ts` 的 600px 断点）——同一台手机从竖屏转横屏可能越过断点，此时该整树
 * 换外壳，而不是把两套外壳同时挂在 DOM 里。
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
