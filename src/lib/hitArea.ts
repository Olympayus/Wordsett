/**
 * 44dp 触摸命中区样式（v0.7.10 Task 16，规格 §7.4）。
 *
 * 与 `lib/mobileHitArea.ts` 的**同名函数**刻意并存、语义不同，改任何一处前先读这段：
 * - `mobileHitArea.hitAreaStyle(opts?)` 是 v0.7.7 触摸编辑用的配方：**无门控**，调用方
 *   自己决定要不要挂（`LeafFlow` 只在触摸语境里渲染它），且默认从父级左上角铺 44×44。
 * - 本函数带 `isTouch` 门控：非触摸语境返回 `null`（调用点因此拿不到任何样式对象，桌面
 *   与平板逐字不变），触摸语境返回**以父级为中心**的 44×44 绝对定位覆盖层——用 `inset`
 *   把四条边同时外扩 / 内收，控件视觉尺寸一个像素都不动，也不产生布局盒子（不参与折行、
 *   不挤动相邻内容）。
 *
 * 44dp 按逻辑 CSS 像素计：平板 `zoom` 下不做 `1/zoom` 补偿（规格 §7.4 口径），且本任务
 * 根本不给平板扩圈——是否触摸由调用点判（手机外壳 = `usesMobileShell(platform)`）。
 */

/** 命中区最小边长（逻辑 CSS 像素）。 */
export const HIT_TARGET_PX = 44

/**
 * `isTouch` 为真时返回 44×44、中心对齐父级的绝对定位样式；否则 `null`。
 *
 * `inset` 的算术：左右（上下）各收 `(100% - 44px) / 2`。父级小于 44 时结果为负、覆盖层
 * 向外扩到 44×44；大于 44 时结果为正、覆盖层缩回父级内（不会比控件本身更小之外还乱盖）。
 * 父级必须是定位祖先（`position: relative`），否则覆盖层会锚到更外层——各调用点自备。
 */
export function hitAreaStyle(isTouch: boolean): { position: 'absolute'; inset: string; content: '' } | null {
  if (!isTouch) return null
  return {
    position: 'absolute',
    inset: `calc((100% - ${HIT_TARGET_PX}px) / 2)`,
    // 接口约定保留 `content`（纯样式对象可直接喂给伪元素场景）；作为 span 的内联样式无副作用。
    content: '',
  }
}
