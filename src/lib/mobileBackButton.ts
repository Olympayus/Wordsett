/**
 * 手机外壳的方向锁定与「返回」的落点（Task 10）。
 *
 * 两件事同住一个文件，因为它们都是「手机外壳一挂载就要做的事」：锁方向与订阅安卓返回键。
 * `MobileShell` 只负责**在挂载时调一次**，不复制任何判据——「按什么方向锁」「返回键在哪」
 * 都收在这里。
 */

import { invoke } from '@tauri-apps/api/core'
import { onBackButtonPress } from '@tauri-apps/api/app'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { orientationFor, type PlatformClass } from './platform'

/** 方向锁定的入参。Rust 侧是 `Option<String>` 的 `orientation`（Tauri 的 camelCase 映射）。 */
export interface OrientationArgs {
  orientation: 'portrait' | 'landscape' | null
}

/**
 * 把当前形态锁到对应方向：手机竖屏、平板横屏、桌面不锁。
 *
 * 为什么要在运行时调而不是写进 `tauri.conf.json` 的 `android.screenOrientation`：平板形态与
 * 手机形态是**同一套 APK**，清单里只能写死一个方向，而两者的正确值相反。故这个值刻意留在
 * 运行时——手机外壳挂载时按 `orientationFor` 锁一次。
 *
 * 失败一律吞掉（只 `console.error`）：方向没锁上不该拦住外壳启动，而这条路径的失败原因
 * （安卓端 JNI 异常 / 桌面端命令不存在）都不需要用户做什么。调用点也**不 await**（外壳挂载
 * 不该等一个可能永远不回来的 Promise）。
 */
export function applyScreenOrientation(platform: PlatformClass): void {
  const orientation = orientationFor(platform)
  void invoke<unknown>('set_screen_orientation', { orientation } satisfies OrientationArgs)
    .catch((e: unknown) => console.error('[mobile] set_screen_orientation 失败：', e))
}

/**
 * 订阅安卓返回键。返回**退订函数**（`MobileShell` 在卸载时调），失败（非 Tauri 环境）时
 * 返回一个空操作的退订——调用点因此不必区分「订阅成功」与「根本没订阅」。
 *
 * 用 `onBackButtonPress`（Tauri 的 `app` 插件）而不是自己 `listen('back-button')`：
 * 插件那层已经把事件名与 payload 定死，且**只在安卓上**存在，别处调用会 reject——那正是
 * 我们要的「非 Tauri 空操作」。
 */
export async function registerMobileBack(handler: () => void): Promise<() => void> {
  try {
    const listener = await onBackButtonPress(() => handler())
    // `PluginListener.unregister()` 只在自己所属的插件内退订，返回 Promise 以便失败可忽略。
    return () => { void listener.unregister() }
  } catch {
    return () => {}
  }
}

/**
 * 返回栈空了：关掉窗口。
 *
 * 用 `destroy()` 而不是 `close()`：`close()` 会先触发 `CloseRequested`，而仓库的关窗分流
 * 默认「最小化到托盘」（`config::bool_at(..., "window.close_to_tray", true)`）——手机上没有
 * 托盘，那条路会留下一个看不见的常驻进程，用户再也唤不回这个窗口。`destroy()` 是直接关掉。
 *
 * 手机上没有「重启应用」这条路（`plugin-process` 的 `relaunch()` 在安卓上不支持），故此处
 * 不引它。桌面不挂 `MobileShell`，这条路径在桌面上不可达。
 */
export async function exitMobileApp(): Promise<void> {
  try {
    await getCurrentWindow().destroy()
  } catch (e) {
    console.error('[mobile] 退出失败：', e)
  }
}
