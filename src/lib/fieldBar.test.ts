import { describe, it, expect } from 'vitest'
import { barExtent } from './fieldBar'

describe('色条分段几何（v0.7.4 决定八）', () => {
  // 45% 混色的条是**半透明**的：相邻两行的条一旦重叠，重叠处会叠成第二层、颜色异常加深。
  // 行的 padding 盒彼此相接，故中间行只需覆盖自己的盒（0 延伸）就已经首尾相接——
  // 任何负值都是多余的重叠，正是「一段一段」观感的来源。
  it('段中间的行走满自己的盒，与前后行恰好相接、不重叠', () => {
    expect(barExtent(false, false, 3)).toEqual({ top: 0, bottom: 0 })
  })
  it('段首行不向上延伸、段末行不向下延伸——这样释义之间才有断点', () => {
    expect(barExtent(true, false, 3)).toEqual({ top: 3, bottom: 0 })
    expect(barExtent(false, true, 3)).toEqual({ top: 0, bottom: 3 })
  })
  it('只有一行时两端都收在行内', () => {
    expect(barExtent(true, true, 3)).toEqual({ top: 3, bottom: 3 })
  })
})
