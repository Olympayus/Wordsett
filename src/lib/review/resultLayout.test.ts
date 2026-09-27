import { describe, it, expect } from 'vitest'
import { NARROW_READING_WIDTH, RESULT_BREAKPOINT, RESULT_CONTENT_WIDTH, resultGridColumns } from './resultLayout'

/**
 * 切出顶层列定义。minmax()/min() 的括号内自带空格，直接 split(' ') 会把
 * 「minmax(0, 1fr) 268px」数成 3 列、单列数成 2 列——先按括号配平再切。
 */
function tracks(cols: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of cols) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ' ' && depth === 0) {
      if (cur) out.push(cur)
      cur = ''
    } else cur += ch
  }
  if (cur) out.push(cur)
  return out
}

/**
 * 断言「可收缩」这条属性本身：左轨得是 minmax(0, <弹性>) 或 min(0, minmax(0, <弹性>))，
 * 零下限才意味着「允许被压到内容宽以下」（默认的 min-width:auto 会被长释义顶破网格）。
 * 认的是 min/max 前缀与零下限，而不是 minmax(0, 1fr) 这一个具体写法——那条断言钉的是
 * CSS 拼写，改个等价写法就误报；本仓库没有 DOM 环境，这里只能到语法层。
 */
function assertShrinkable(track: string) {
  const m = track.match(/^(?:minmax|min|max)\(\s*(?:0|0px)\s*,\s*(?:minmax|min|max)\(\s*(?:0|0px)\s*,\s*(\S+?)\s*\)\s*\)$/)
    ?? track.match(/^minmax\(\s*(?:0|0px)\s*,\s*(\S+?)\s*\)$/)
  expect(m, `左轨不可收缩：${track}`).not.toBeNull()
  expect(m![1], `左轨没有弹性：${track}`).toMatch(/^\d/)
}

describe('结果区两栏版式（v0.6.3 条目 16）', () => {
  it('断点 1100：与内容区上限同一个数，两处不同值会出现「窗口够宽了但内容区还是 960」', () => {
    expect(RESULT_BREAKPOINT).toBe(1100)
  })

  it('内容区上限由断点派生：写死的 ' + "'1100px'" + ' 会与断点悄悄分家', () => {
    expect(RESULT_CONTENT_WIDTH).toBe(`${RESULT_BREAKPOINT}px`)
  })

  it('宽屏是两列，且右列是固定 268px（词条不跟着窗口无限拉宽）', () => {
    const t = tracks(resultGridColumns(false))
    expect(t).toHaveLength(2)
    expect(t[1]).toBe('268px')
    // 左列必须能收缩，否则长释义会把网格顶破
    assertShrinkable(t[0])
  })

  it('窄屏是单列（DOM 顺序＝作答在前、词条在后，即「完整词条置底」）', () => {
    const t = tracks(resultGridColumns(true))
    expect(t).toHaveLength(1)
    assertShrinkable(t[0])
  })

  it('窄屏只有作答块限宽（560px），三键仍占满整宽——限宽套在整块上会把三键一起压窄', () => {
    expect(NARROW_READING_WIDTH).toBe(560)
  })
})
