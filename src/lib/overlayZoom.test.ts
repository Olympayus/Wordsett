import { describe, it, expect } from 'vitest'
import { positionFor, scaleForAnchor, zoomOf } from './overlayZoom'

/**
 * 浮层缩放补偿（v0.7.10 Task 18）。
 *
 * 坐标一律是**视觉坐标**（`getBoundingClientRect` / `clientX`）：平板 `zoom` 宿主下
 * 这两个接口本来就返回缩放后的视口坐标，而落进 body 的 portal 面板不再被 zoom 影响，
 * 因此位置直接可用、尺寸才需要 `scale(zoom)` 补回来。`positionFor` 里的 `panel`
 * 传的是面板的**布局尺寸**（CSS px），钳制时按 `× zoom` 换算成视觉尺寸。
 *
 * node 环境没有 DOM：`zoomOf` 的祖先遍历用最小替身驱动（computed zoom 的真实读取
 * 只能在浏览器里验，平板模拟器手检项）；`positionFor` 的视口钳制用 `withViewport` 临时
 * 挂一个 `window`。
 */

function withViewport(width: number, height: number, fn: () => void) {
  const g = globalThis as { window?: { innerWidth: number; innerHeight: number } }
  g.window = { innerWidth: width, innerHeight: height }
  try { fn() } finally { delete g.window }
}

/** 最小元素替身：只提供 zoomOf 会用到的 ownerDocument / parentElement。 */
function fakeZoomEl(zoom: string, parent: Element | null = null): Element {
  const view = { getComputedStyle: () => ({ getPropertyValue: () => zoom }) }
  return {
    ownerDocument: { defaultView: view },
    parentElement: parent,
  } as unknown as Element
}

describe('zoomOf', () => {
  it('null → 1', () => {
    expect(zoomOf(null)).toBe(1)
  })

  it('元素自身有 zoom → 取它', () => {
    expect(zoomOf(fakeZoomEl('0.85'))).toBe(0.85)
  })

  it('自身 zoom 为 1 时向上找第一个非 1 的祖先', () => {
    expect(zoomOf(fakeZoomEl('1', fakeZoomEl('0.8', fakeZoomEl('1'))))).toBe(0.8)
  })

  it('百分比写法也认', () => {
    expect(zoomOf(fakeZoomEl('85%'))).toBe(0.85)
  })

  it('读不到 computed zoom（空串）按 1 处理', () => {
    expect(zoomOf(fakeZoomEl(''))).toBe(1)
  })
})

describe('scaleForAnchor', () => {
  it('scaleForAnchor_null_when_no_zoom_ancestor', () => {
    expect(scaleForAnchor(null)).toBeNull()
  })

  it('zoom 恒为 1 的祖先链 → null（桌面不套 transform）', () => {
    expect(scaleForAnchor(fakeZoomEl('1', fakeZoomEl('1')))).toBeNull()
  })

  it('祖先 zoom 0.85 → scale(0.85)，原点取锚点侧（右上 / 下方展开时即为左上）', () => {
    expect(scaleForAnchor(fakeZoomEl('1', fakeZoomEl('0.85')))).toEqual({
      transform: 'scale(0.85)',
      transformOrigin: 'top left',
    })
  })
})

describe('positionFor', () => {
  it('positionFor_keeps_visual_coords_and_clamps', () => {
    const r = positionFor({ left: 900, top: 40, right: 960, bottom: 70 }, { width: 200, height: 120 }, 'right', 0.85)
    expect(r.x).toBeGreaterThanOrEqual(4)
  })

  it('right：贴锚点右缘，横向按缩放后的面板宽度钳回视口', () => {
    withViewport(1000, 800, () => {
      const r = positionFor({ left: 900, top: 40, right: 960, bottom: 70 }, { width: 200, height: 120 }, 'right', 0.85)
      // 960 + 4 = 964 放不下 200 × 0.85 = 170 宽的面板，钳到 1000 − 170 − 4
      expect(r).toEqual({ x: 826, y: 40 })
    })
  })

  it('below：贴锚点下缘，纵向按缩放后的面板高度钳回视口', () => {
    withViewport(1000, 800, () => {
      const r = positionFor({ left: 300, top: 690, right: 360, bottom: 720 }, { width: 200, height: 120 }, 'below', 0.85)
      // 720 + 4 = 724 放不下 120 × 0.85 = 102 高的面板，钳到 800 − 102 − 4
      expect(r).toEqual({ x: 300, y: 694 })
    })
  })

  it('flip：右侧放得下时走右侧', () => {
    withViewport(1000, 800, () => {
      const r = positionFor({ left: 300, top: 100, right: 360, bottom: 130 }, { width: 200, height: 120 }, 'flip', 0.85)
      expect(r).toEqual({ x: 364, y: 100 })
    })
  })

  it('flip：右侧放不下、下方放得下时翻到下方', () => {
    withViewport(1000, 800, () => {
      const r = positionFor({ left: 780, top: 100, right: 840, bottom: 130 }, { width: 200, height: 120 }, 'flip', 0.85)
      // 右侧余量 156 < 170 + 4，下方余量足够 → 贴锚点左下
      expect(r).toEqual({ x: 780, y: 134 })
    })
  })

  it('flip：两边都放不下时选更宽裕的一侧，并保持在视口内', () => {
    withViewport(1000, 800, () => {
      const r = positionFor({ left: 840, top: 700, right: 900, bottom: 750 }, { width: 200, height: 120 }, 'flip', 0.85)
      // 右侧余量 96 > 下方余量 46 → 仍走右侧，再按视觉尺寸钳回视口
      expect(r).toEqual({ x: 826, y: 694 })
    })
  })

  it('zoom = 1 与 clampMenuPosition 的桌面结果逐字一致', () => {
    withViewport(800, 600, () => {
      expect(positionFor({ left: 700, top: 560, right: 700, bottom: 560 }, { width: 168, height: 100 }, 'right', 1))
        .toEqual({ x: 628, y: 496 })
    })
  })

  it('视口比面板还小时仍落在左上余量处，不返回负数', () => {
    withViewport(120, 90, () => {
      const r = positionFor({ left: 10, top: 10, right: 20, bottom: 20 }, { width: 200, height: 120 }, 'right', 1)
      expect(r).toEqual({ x: 4, y: 4 })
    })
  })
})
