import { describe, it, expect } from 'vitest'
import { ENTRY_BAND_WIDTH, ENTRY_MEASURE, NAV_CONTROL_HEIGHT, NAV_HEIGHT } from './layout'

describe('词条页共享版式常量（v0.7.2）', () => {
  // 断言照旧严格（数值与符号都不松），改的只是它的**读法**：v0.7.2 修复 3 起两页的正文度量都取
  // ENTRY_BAND_WIDTH，ENTRY_MEASURE 已无消费点（常量按「token 名永不删」保留、layout.ts 注明）。
  // 这条钉住的不再是「两页正文停在 660」，而是这个常量与列宽的历史关系仍然成立——
  // 谁把它接回正文，都要先看懂它为什么窄于整列。
  it('ENTRY_MEASURE 曾窄于头带（旧正文度量的历史关系仍成立，尽管它现已无消费点）', () => {
    expect(ENTRY_MEASURE).toBeLessThan(ENTRY_BAND_WIDTH)
  })

  it('导航条与控件高度成对（控件必须比条矮，否则条会撑着变高）', () => {
    expect(NAV_CONTROL_HEIGHT).toBeLessThan(NAV_HEIGHT)
    expect(NAV_HEIGHT).toBe(32)
  })
})
