import { hitAreaStyle } from '../../lib/hitArea'
import { usesMobileShell } from '../../lib/platform'
import { usePlatformClass } from '../../lib/usePlatform'

/**
 * 44dp 触摸命中层（v0.7.10 Task 16，规格 §7.4）。
 *
 * 一个透明、绝对定位的 span：视觉尺寸 / 布局 / 折行全部不动，只把可点面积扩到 44×44。
 * 挂法是把 `<HitArea />` 放进目标控件（按钮）内部，控件自己必须是定位祖先
 * （`position: relative`）——否则覆盖层会锚到更外层。样式全部来自 `lib/hitArea.ts`。
 *
 * **是否扩圈只认手机外壳，不认 `touch`**：`touch` 在 Android 平板上也为真（长按 / 拖拽
 * 等触摸语义），若拿它判断就会给平板加命中层、推动桌面几何回归。平板是鼠标 + 触摸混合
 * 设备，规格 §7.4 裁定「平板沿用桌面几何」。故共享控件（`CheckBox` / `Toggle`）与手机
 * 外壳组件统一走下面这个 hook：`usesMobileShell(platform)` 只有 `android-phone` 为真。
 *
 * 与 `lib/mobileHitArea.ts` 的同名配方不是一回事（后者无门控、供 `LeafFlow` 的触摸编辑
 * 使用），区别写在该文件头。
 */
export function useMobileShellHitArea(): boolean {
  return usesMobileShell(usePlatformClass())
}

export default function HitArea({ show }: { show: boolean }) {
  const style = hitAreaStyle(show)
  if (!style) return null
  return <span aria-hidden="true" style={style} />
}
