import { describe, it, expect } from 'vitest'
import { popoverPosition, POPOVER_GAP, POPOVER_MARGIN, POPOVER_MAX_HEIGHT_RATIO } from './CategoryPickerPopover'

/**
 * 浮层落点（v0.6.5 修订）。
 *
 * 这个函数的全部存在理由是**面板不许被裁、不许跑到画面外**——原来那版 absolute 定位
 * 被词条卡的 overflow: hidden 整块吃掉，用户点开什么也看不见。node 环境渲染不到 DOM，
 * 能钉住的就只有这套几何：把「视口 / 锚点 / 面板」三个矩形喂进来，断言落点。
 *
 * 视口统一取 1000×800（0.6 比例 = 480px 的高度上限），锚点写成 28×28 的方钮。
 */
const VIEWPORT = { width: 1000, height: 800 }
const PANEL = { width: 220, height: 300 }
const anchorAt = (left: number, top: number) => ({ left, top, right: left + 28, bottom: top + 28 })

describe('popoverPosition：纵向', () => {
  it('下方放得下：贴锚点下沿，隔一个 gap', () => {
    const { top, maxHeight } = popoverPosition({
      anchor: anchorAt(300, 100), panel: PANEL, viewport: VIEWPORT,
    })
    expect(top).toBe(128 + POPOVER_GAP)
    // 高度上限取「面板自身高度 / 视口比例 / 那一侧的余量」三者最小，这里是面板自身
    expect(maxHeight).toBe(300)
  })

  it('下方放不下、上方宽裕：翻到上方，且面板底边与锚点上沿之间仍是那个 gap', () => {
    const anchor = anchorAt(300, 700)  // 锚点离底边只有 72px
    const { top, maxHeight } = popoverPosition({
      anchor, panel: PANEL, viewport: VIEWPORT,
    })
    expect(top).toBe(anchor.top - POPOVER_GAP - PANEL.height)
    expect(top + PANEL.height).toBe(anchor.top - POPOVER_GAP)
    expect(maxHeight).toBe(300)      // 上方余量足够，不压缩
  })

  it('两边都不够：选宽裕的一侧，并把高度收到那一侧的余量（宁可内部滚动，不许越界）', () => {
    const anchor = anchorAt(300, 400)
    const { top, maxHeight } = popoverPosition({
      anchor, panel: { width: 220, height: 700 }, viewport: VIEWPORT,
    })
    const roomAbove = anchor.top - POPOVER_GAP - POPOVER_MARGIN
    expect(maxHeight).toBe(roomAbove)
    expect(top).toBe(POPOVER_MARGIN)
    // 面板整块在视口内
    expect(top + maxHeight).toBeLessThanOrEqual(anchor.top - POPOVER_GAP)
  })

  it('高度上限不越过视口比例', () => {
    const { maxHeight } = popoverPosition({
      anchor: anchorAt(300, 20), panel: { width: 220, height: 900 }, viewport: VIEWPORT,
    })
    expect(maxHeight).toBe(VIEWPORT.height * POPOVER_MAX_HEIGHT_RATIO)
  })

  it('placement="top" 在下方放得下时依然优先向上（首选方向说了算）', () => {
    const anchor = anchorAt(300, 700)
    const up = popoverPosition({ anchor, panel: PANEL, viewport: VIEWPORT, placement: 'top' })
    expect(up.top).toBe(anchor.top - POPOVER_GAP - PANEL.height)
    // 同一个锚点，默认的 bottom 也被翻成了上方——两条路径给出同一个落点
    const auto = popoverPosition({ anchor, panel: PANEL, viewport: VIEWPORT })
    expect(auto.top).toBe(up.top)
  })
})

describe('popoverPosition：横向', () => {
  it('右对齐：面板右边缘贴锚点右边缘', () => {
    const anchor = anchorAt(500, 100)
    const { left } = popoverPosition({ anchor, panel: PANEL, viewport: VIEWPORT })
    expect(left).toBe(anchor.right - PANEL.width)
  })

  it('左对齐：面板左边缘贴锚点左边缘', () => {
    const anchor = anchorAt(500, 100)
    const { left } = popoverPosition({ anchor, panel: PANEL, viewport: VIEWPORT, align: 'left' })
    expect(left).toBe(anchor.left)
  })

  it('锚点贴右边缘、又是右对齐：整体推回视口内，不越出右边缘', () => {
    const anchor = anchorAt(990, 100)   // 右边缘 1018 已经在视口外
    const { left } = popoverPosition({ anchor, panel: PANEL, viewport: VIEWPORT })
    expect(left).toBe(VIEWPORT.width - POPOVER_MARGIN - PANEL.width)
  })

  it('锚点贴左边缘、又是右对齐：不越出左边缘', () => {
    const anchor = anchorAt(2, 100)
    const { left } = popoverPosition({ anchor, panel: PANEL, viewport: VIEWPORT })
    expect(left).toBe(POPOVER_MARGIN)
  })

  it('视口比面板还窄：仍落在视口内（左余量处）', () => {
    const anchor = anchorAt(60, 100)
    const { left } = popoverPosition({
      anchor, panel: PANEL, viewport: { width: 180, height: 800 },
    })
    expect(left).toBe(POPOVER_MARGIN)
  })
})
