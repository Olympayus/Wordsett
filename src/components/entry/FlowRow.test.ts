import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./FlowRow.tsx', import.meta.url), 'utf8')

// 源码级守卫（沿用本仓做法：没有组件测试 harness，视觉/布局回归钉在源码形状上）。
// 行尾槽若不脱离基线对齐，行高会由槽内第一枚控件决定——普通模式是 SVG `⋯`、编者模式是
// 文字 `＋`，两者基线相差数像素，于是切换编者模式时每一行的高度都会变（用户实测：
// 「整体文字被压缩、多看到一行」）。槽只许贡献 22px 的高度与零基线。
describe('行尾槽不参与基线对齐（v0.7.4 修复轮）', () => {
  it('end 槽带 alignSelf: center', () => {
    const at = src.indexOf("marginLeft: 'auto'")
    expect(at, 'FlowRow 要有行尾槽').toBeGreaterThan(-1)
    expect(src.slice(at, at + 200), '行尾槽必须 alignSelf: center').toMatch(/alignSelf: 'center'/)
  })

  it('内容行仍是基线对齐（文字与标签共用一条基线）', () => {
    expect(src).toMatch(/alignItems: 'baseline'/)
  })
})
