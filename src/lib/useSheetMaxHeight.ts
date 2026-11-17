import { useEffect, useState } from 'react'

/**
 * 手机底部表的最大高度（v0.7.10 Task 17，规格 §7.4「配 visualViewport 收键盘滚动」）。
 *
 * 表体只写 `maxHeight: 88vh` 时跟的是**布局视口**：`autoFocus` 弹出键盘后，若 WebView
 * 走 adjustPan（而不是把布局视口缩小），脚键与表单下半截会被键盘压住。这里改为跟随
 * `visualViewport`——它是键盘之上的真实可见区域。
 *
 * 取 `min(可视高度 × 0.92, innerHeight × 0.88)`：
 * - `visualViewport.height` 是键盘弹起后的可见高度，× 0.92 给遮罩上缘留呼吸；
 * - 布局视口的 88% 是原设计上限，键盘未弹时两者取小，与旧行为一致。
 *
 * 环境没有 `visualViewport`（旧 WebView / node 测试）时返回 `undefined`，
 * 调用点回落到 `'88vh'`。`open` 为假时不订阅、不测量，表未挂载就没有意义。
 */
export function useSheetMaxHeight(isMobile: boolean, open: boolean): number | undefined {
  const [maxHeight, setMaxHeight] = useState<number>()

  useEffect(() => {
    if (!isMobile || !open) return
    const vv = window.visualViewport
    if (!vv) return
    const apply = () => {
      setMaxHeight(Math.min(vv.height * 0.92, window.innerHeight * 0.88))
    }
    apply()
    // resize 跟键盘 / 旋转；scroll 跟 adjustPan 下可视区在布局视口内的位移。
    vv.addEventListener('resize', apply)
    vv.addEventListener('scroll', apply)
    return () => {
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
    }
  }, [isMobile, open])

  return maxHeight
}
