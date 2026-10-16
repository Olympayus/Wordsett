import type { ThemeMode } from '../stores/settingsStore'

export type ResolvedTheme = 'light' | 'dark'

/**
 * 把三档设置解析成**两个具体值之一**（v0.7.3）。
 *
 * `system` 必须在 JS 里解析：`data-theme` 只承载 light / dark，写 'system' 进去会让
 * `[data-theme='dark']` 与浅色 :root 都不命中（:root 是兜底，深色块靠属性选择器），
 * 结果是整页落在浏览器默认色上。抽成纯函数是为了能在 node 环境里钉住这一条。
 */
export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === 'light') return 'light'
  if (mode === 'dark') return 'dark'
  return prefersDark ? 'dark' : 'light'
}

/** 把解析结果写到 <html> 上。CSS 只认这个属性，别处不要自己写 documentElement。 */
export function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.dataset.theme = resolved
}

/**
 * 窗口自身的底色与系统主题（Tauri 2.11 的 JS API，**不需要写 Rust**）。
 * 非 Tauri 环境（浏览器里跑 vitest / vite dev）动态 import 会失败，整段静默吞掉——
 * 它只是首屏那几十毫秒的兜底，失败不影响功能。
 */
export async function applyWindowTheme(resolved: ResolvedTheme): Promise<void> {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const w = getCurrentWindow()
    await w.setTheme(resolved)
    await w.setBackgroundColor(resolved === 'dark' ? [0x23, 0x23, 0x23, 255] : [0xf9, 0xf8, 0xf5, 255])
  } catch { /* 非 Tauri 环境（vite dev / vitest）：静默跳过 */ }
}
