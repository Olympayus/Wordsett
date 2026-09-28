import { describe, it, expect } from 'vitest'
import {
  RESULT_BREAKPOINT, RESULT_CONTENT_WIDTH, NARROW_CONTENT_WIDTH, RESULT_HALF_WIDTH, resultGridColumns,
} from './resultLayout'

/** 切出顶层列定义。minmax() 的括号内自带空格，直接 split(' ') 会把「minmax(0, 1fr) 1fr」数成 3 列。 */
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
 * 断言「可收缩」这条属性本身：轨道得是 minmax(0, <长度>) 之类，零下限才意味着
 * 「允许被压到内容宽以下」（默认的 min-width:auto 会被长释义顶破网格）。
 * 认的是 min/max 前缀与零下限，而不是 minmax(0, 1fr) 这一个具体写法——那条断言钉的是
 * CSS 拼写，改个等价写法就误报；本仓库没有 DOM 环境，这里只能到语法层。
 */
function assertShrinkable(track: string) {
  const m = track.match(/^(?:minmax|min|max)\(\s*(?:0|0px)\s*,\s*(?:minmax|min|max)\(\s*(?:0|0px)\s*,\s*(\S+?)\s*\)\s*\)$/)
    ?? track.match(/^minmax\(\s*(?:0|0px)\s*,\s*(\S+?)\s*\)$/)
  expect(m, `轨道不可收缩：${track}`).not.toBeNull()
  expect(m![1], `轨道没有长度：${track}`).toMatch(/^\d/)
}

describe('答题页版式常量', () => {
  it('断点 1100：与两栏内容区上限同一个数', () => {
    expect(RESULT_BREAKPOINT).toBe(1100)
  })

  it('两栏内容区上限由断点派生：写死的 ' + "'1100px'" + ' 会与断点悄悄分家', () => {
    expect(RESULT_CONTENT_WIDTH).toBe(`${RESULT_BREAKPOINT}px`)
  })

  it('单侧上限 550 ＝ 内容区上限的一半：左侧占满左 1/2，不按内容伸缩', () => {
    // 「如果左侧仍有空间（即没触及 1/2 的宽度）则占满左 1/2」——1/2 是相对内容区上限。
    // 对分由 resultGridColumns 的 1fr 1fr 承担；这个数管的是单栏时左栏的上限。
    expect(RESULT_HALF_WIDTH).toBe(550)
  })

  it('窄屏单栏上限比两栏窄：单列下整行更长，正文行宽要收着读', () => {
    expect(NARROW_CONTENT_WIDTH).toBe('960px')
    expect(RESULT_HALF_WIDTH).toBeLessThan(Number.parseInt(NARROW_CONTENT_WIDTH, 10))
  })
})

describe('答题页两栏网格列定义', () => {
  it('并排时两轨**等分**且都可收缩', () => {
    // 等分而非「左轨按内容、右轨吃余量」：后者在宽窗口下会在左侧留下一条空白带，
    // 看上去就是错位。用户要的是「占满左 1/2」，不是「够宽就按内容」。
    const t = tracks(resultGridColumns(true))
    expect(t).toHaveLength(2)
    expect(t[0]).toBe(t[1])
    assertShrinkable(t[0])
    assertShrinkable(t[1])
  })

  it('单列时一轨（DOM 顺序＝左栏在前、完整词条在后，即「完整词条置底」）', () => {
    const t = tracks(resultGridColumns(false))
    expect(t).toHaveLength(1)
    assertShrinkable(t[0])
  })
})
