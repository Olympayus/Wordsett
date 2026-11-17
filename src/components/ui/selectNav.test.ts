import { describe, it, expect } from 'vitest'
import { nextIndex } from './selectNav'

describe('nextIndex（自绘 Select 的键盘循环）', () => {
  it('nextIndex_wraps', () => {
    expect(nextIndex(0, 1, 3)).toBe(1)
    expect(nextIndex(2, 1, 3)).toBe(0)
    expect(nextIndex(0, -1, 3)).toBe(2)
    expect(nextIndex(0, 1, 0)).toBe(-1)
  })

  it('空表两个方向都返回 -1', () => {
    expect(nextIndex(0, -1, 0)).toBe(-1)
    expect(nextIndex(-1, 1, 0)).toBe(-1)
  })

  it('当前位失效时按首位归一（值不在选项表里时打开下拉的落点）', () => {
    expect(nextIndex(-1, 1, 3)).toBe(0)
    expect(nextIndex(3, -1, 3)).toBe(2)
    expect(nextIndex(9, 1, 3)).toBe(0)
  })
})
