import { describe, it, expect } from 'vitest'
import { READING_WIDTH, RESULT_BREAKPOINT, RESULT_CONTENT_WIDTH, resultGridColumns } from './resultLayout'

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
 * 断言「可收缩」这条属性本身：轨道得是 minmax(0, <长度>) / minmax(0, min(<…>)) 之类，
 * 零下限才意味着「允许被压到内容宽以下」（默认的 min-width:auto 会被长释义顶破网格）。
 * 认的是 min/max 前缀与零下限，而不是 minmax(0, 1fr) 这一个具体写法——那条断言钉的是
 * CSS 拼写，改个等价写法就误报；本仓库没有 DOM 环境，这里只能到语法层。
 *
 * **不管上限是多少**：`\S+?` 连 `1fr` 也收得下，所以「上限 1fr（等于没封顶）」这种
 * 退化写法本函数照样放行。上限具体是多少由调用点的 toContain 单独钉住。
 */
function assertShrinkable(track: string) {
  const m = track.match(/^(?:minmax|min|max)\(\s*(?:0|0px)\s*,\s*(?:minmax|min|max)\(\s*(?:0|0px)\s*,\s*(\S+?)\s*\)\s*\)$/)
    ?? track.match(/^minmax\(\s*(?:0|0px)\s*,\s*(\S+?)\s*\)$/)
  expect(m, `轨道不可收缩：${track}`).not.toBeNull()
  expect(m![1], `轨道没有长度：${track}`).toMatch(/^\d/)
}

describe('结果区两栏版式（v0.6.3 条目 16）', () => {
  it('断点 1100：与内容区上限同一个数，两处不同值会出现「窗口够宽了但内容区还是 960」', () => {
    expect(RESULT_BREAKPOINT).toBe(1100)
  })

  it('内容区上限由断点派生：写死的 ' + "'1100px'" + ' 会与断点悄悄分家', () => {
    expect(RESULT_CONTENT_WIDTH).toBe(`${RESULT_BREAKPOINT}px`)
  })

  it('宽屏两轨：左轨封顶、能收缩，右轨弹性（词条吃余量）', () => {
    const t = tracks(resultGridColumns(false))
    expect(t).toHaveLength(2)
    // 左轨必须能收缩，否则长释义会把网格顶破
    assertShrinkable(t[0])
    // 且必须真的封顶：上面那个断言对 `minmax(0, 1fr)`（等于没封顶）同样放行。
    expect(t[0]).toContain(`${READING_WIDTH}px`)
    // 右轨不再是定宽 268px，但下限还在——词条栏太窄时例句会碎成一列单词
    expect(t[1]).toBe('minmax(268px, 1fr)')
  })

  it('右轨的下限 268 与左轨的上限 560 相加仍小于断点内容盒：两栏在断点处放得下', () => {
    // 560 + 22(gap) + 268 = 850 ≤ 1100 − 64(p-8)，故断点一侧不会有「两栏挤成一栏宽」的态。
    const t = tracks(resultGridColumns(false))
    expect(t[0]).toBe('minmax(0, 560px)')
    expect(t[1]).toBe('minmax(268px, 1fr)')
    expect(RESULT_BREAKPOINT - 64).toBeGreaterThanOrEqual(560 + 22 + 268)
  })

  it('窄屏是单列（DOM 顺序＝作答在前、词条在后，即「完整词条置底」）', () => {
    const t = tracks(resultGridColumns(true))
    expect(t).toHaveLength(1)
    assertShrinkable(t[0])
  })

  it('阅读宽度 560：窄屏作答行的 maxWidth 与宽屏左轨上限是同一个数', () => {
    // 拆成两个值就会在拖窗口经过断点时跳一下——两处描述的是同一件事。
    expect(READING_WIDTH).toBe(560)
  })
})
