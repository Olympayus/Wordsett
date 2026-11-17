// 松手后的收敛动画（v0.7.10 任务 8，规格 §10 FLIP）
//
// 重排是「数据先写库、React 提交后重新布局」：行从旧位置瞬移到新位置，观感上是跳变。
// FLIP 的做法是——写库前记下每行的视觉坐标（getBoundingClientRect），提交后量新坐标，
// 先把元素按 `after - before` 的取反位移拉回旧位置，再在下一帧过渡到零。
//
// 为什么用视觉坐标而不是 offsetTop：同级组以 `getBoundingClientRect` 计算，平板外壳的
// zoom 缩放因此不改变位移方向 / 比例（缩放后新旧坐标同一坐标系，差值直接可用）。
//
// 为什么纯函数与播放器分开：仓库 vitest 只有 node 环境（`src/**/*.test.ts`），DOM 行为
// 无法单测；测试只钉 `flipDelta` 的方向语义，`playFlip` 由手检覆盖。

export interface FlipDelta {
  dx: number
  dy: number
}

/** 起点位移：把元素从现在（after）拉回旧位置（before），故为 `after - before` 的取反。 */
export function flipDelta(before: { left: number; top: number }, after: { left: number; top: number }): FlipDelta {
  return { dx: before.left - after.left, dy: before.top - after.top }
}

const DURATION_MS = 200
const EASING = 'cubic-bezier(.2,.7,.3,1)'
// 兜底清样式的期限：过渡正常情况下 200ms 就结束，这里多留余量；元素被卸载 / 过渡被中断时
// `transitionend` 不会触发，靠它把内联样式收回，绝不给 DOM 留下 transform。
const DEFAULT_DEADLINE_MS = 400

/**
 * 逐元素播放 FLIP：`els[i]` 的旧坐标是 `before[i]`（调用方在重排前用 `getBoundingClientRect`
 * 记下的视觉坐标）。位移为零的元素（没动、或写库失败后布局没变）直接跳过；结束清掉内联
 * transition / transform。
 */
export function playFlip(
  els: readonly HTMLElement[],
  before: readonly { left: number; top: number }[],
  deadlineMs: number = DEFAULT_DEADLINE_MS,
): void {
  // 无 rAF 的环境（理论上只有非浏览器宿主）静默不播，不抛错。
  if (typeof requestAnimationFrame !== 'function') return
  const moved: { el: HTMLElement; dx: number; dy: number }[] = []
  els.forEach((el, i) => {
    const b = before[i]
    if (!el || !b) return
    const after = el.getBoundingClientRect()
    const { dx, dy } = flipDelta(b, after)
    if (dx === 0 && dy === 0) return
    moved.push({ el, dx, dy })
  })
  if (moved.length === 0) return

  // 起点：禁用过渡、直接放到旧位置。
  for (const { el, dx, dy } of moved) {
    el.style.transition = 'none'
    el.style.transform = `translate(${dx}px, ${dy}px)`
  }
  // 强制一次样式解析（读 offsetWidth），让起点位移成为「上一帧已画出的样式」，
  // 下一帧的过渡才有可插值的起点，而不是和终点合并成一次跳变。
  void moved[0].el.offsetWidth

  requestAnimationFrame(() => {
    for (const { el } of moved) {
      el.style.transition = `transform ${DURATION_MS}ms ${EASING}`
      el.style.transform = ''
    }
    let done = false
    const listeners: { el: HTMLElement; handler: (e: TransitionEvent) => void }[] = []
    const cleanup = () => {
      if (done) return
      done = true
      for (const { el, handler } of listeners) el.removeEventListener('transitionend', handler)
      for (const { el } of moved) {
        el.style.transition = ''
        el.style.transform = ''
      }
    }
    for (const { el } of moved) {
      // 只认本元素自己的 transform 过渡：`transitionend` 会冒泡，子元素（如全局
      // background-color 90ms）过渡结束时不能把我们提前收掉。
      const handler = (e: TransitionEvent) => {
        if (e.target === el && e.propertyName === 'transform') cleanup()
      }
      listeners.push({ el, handler })
      el.addEventListener('transitionend', handler)
    }
    setTimeout(cleanup, deadlineMs)
  })
}
