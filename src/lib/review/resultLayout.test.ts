import { describe, it, expect } from 'vitest'
import { RESULT_BREAKPOINT, resultGridColumns } from './resultLayout'

/**
 * 数顶层列数。minmax() 括号内自带一个空格，直接 split(' ') 会把「minmax(0, 1fr) 268px」
 * 数成 3 列、单列数成 2 列——先把每个 minmax(...) 收成一个记号再切。
 */
function trackCount(cols: string): number {
  return cols.replace(/minmax\([^)]*\)/g, 'M').split(' ').length
}

describe('结果区两栏版式（v0.6.3 条目 16）', () => {
  it('断点 1100：与内容区上限同一个数，两处不同值会出现「窗口够宽了但内容区还是 960」', () => {
    expect(RESULT_BREAKPOINT).toBe(1100)
  })

  it('宽屏是两列，且右列是固定 268px（词条不跟着窗口无限拉宽）', () => {
    const cols = resultGridColumns(false)
    expect(trackCount(cols)).toBe(2)
    expect(cols).toContain('268px')
    // 左列必须能收缩，否则长释义会把网格顶破
    expect(cols).toContain('minmax(0, 1fr)')
  })

  it('窄屏是单列（DOM 顺序＝作答在前、词条在后，即「完整词条置底」）', () => {
    const cols = resultGridColumns(true)
    expect(trackCount(cols)).toBe(1)
    expect(cols).toContain('minmax(0, 1fr)')
  })
})
