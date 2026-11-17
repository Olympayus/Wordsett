// src/lib/pointer.ts
/**
 * 「这台设备的主指针是不是触摸」（v0.7.10）。
 *
 * 与 `platform.ts` 的分工：那边回答「用哪套外壳 / 要不要接返回键」，判据是平台与窗口宽度；
 * 这里回答「有没有悬停这回事」，判据是输入设备。两者刻意分开——桌面触屏、平板接鼠标
 * 这类组合都会让「平台」与「指针」给出不同答案，而浮层该不该挂 hover 只取决于后者。
 *
 * SSR / 测试环境没有 `matchMedia` 时返回 `false`：退回桌面语义（悬停 + 聚焦），
 * 与这些环境里既有的渲染结果一致。
 */
export function hasCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(pointer: coarse)').matches
}
