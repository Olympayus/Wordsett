import { describe, it, expect } from 'vitest'
import { ENTRY_BAND_WIDTH, ENTRY_MEASURE, NAV_CONTROL_HEIGHT, NAV_HEIGHT } from './layout'

describe('词条页共享版式常量（v0.7.2）', () => {
  it('正文度量窄于头带（头带跨整列、义项列更窄）', () => {
    expect(ENTRY_MEASURE).toBeLessThan(ENTRY_BAND_WIDTH)
  })

  it('导航条与控件高度成对（控件必须比条矮，否则条会撑着变高）', () => {
    expect(NAV_CONTROL_HEIGHT).toBeLessThan(NAV_HEIGHT)
    expect(NAV_HEIGHT).toBe(32)
  })
})
