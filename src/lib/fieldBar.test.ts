import { describe, it, expect } from 'vitest'
import { barExtent } from './fieldBar'

describe('色条分段几何（v0.7.4 决定八）', () => {
  it('段中间的行走满自己的内边距，与前后的条相接', () => {
    expect(barExtent(false, false, 3)).toEqual({ top: -3, bottom: -3 })
  })
  it('段首行不向上延伸、段末行不向下延伸——这样释义之间才有断点', () => {
    expect(barExtent(true, false, 3)).toEqual({ top: 3, bottom: -3 })
    expect(barExtent(false, true, 3)).toEqual({ top: -3, bottom: 3 })
  })
  it('只有一行时两端都收在行内', () => {
    expect(barExtent(true, true, 3)).toEqual({ top: 3, bottom: 3 })
  })
})
