import { describe, it, expect } from 'vitest'
import {
  RESULT_BREAKPOINT, RESULT_CONTENT_WIDTH, NARROW_CONTENT_WIDTH, RESULT_HALF_WIDTH, fitsInHalf, resultGridColumns,
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

describe('结果区版式常量', () => {
  it('断点 1100：与两栏内容区上限同一个数', () => {
    expect(RESULT_BREAKPOINT).toBe(1100)
  })

  it('两栏内容区上限由断点派生：写死的 ' + "'1100px'" + ' 会与断点悄悄分家', () => {
    expect(RESULT_CONTENT_WIDTH).toBe(`${RESULT_BREAKPOINT}px`)
  })

  it('单侧上限 550 ＝ 内容区上限的一半', () => {
    // 「左右两侧的上限设为全部空间的 1/2」——1/2 是相对内容区上限，不是相对视口。
    expect(RESULT_HALF_WIDTH).toBe(550)
  })

  it('窄屏单栏上限比两栏窄：单列下整行更长，正文行宽要收着读', () => {
    expect(NARROW_CONTENT_WIDTH).toBe('960px')
    expect(RESULT_HALF_WIDTH).toBeLessThan(Number.parseInt(NARROW_CONTENT_WIDTH, 10))
  })
})

describe('快照能不能与之并排（按最宽不可断行的实测宽度）', () => {
  it('刚好半栏（550）放得下：并排。判据是 <= 不是 <，差一个像素不该让版式翻面', () => {
    expect(fitsInHalf(RESULT_HALF_WIDTH)).toBe(true)
  })

  it('短词条（lemma + 音标 + 词性标签，约 300）放得下', () => {
    expect(fitsInHalf(300)).toBe(true)
  })

  it('超出一像素就置底：宁可整块挪下去，也不要在半栏里换行 / 溢出', () => {
    expect(fitsInHalf(RESULT_HALF_WIDTH + 1)).toBe(false)
  })

  it('长单词 / 长音标（900）置底', () => {
    expect(fitsInHalf(900)).toBe(false)
  })

  it('还没量到（0 ＝ 未测量 / 快照为空）当放得下：先并排，别让首帧闪一下单列', () => {
    // 快照内容是异步取回的，首帧必然是「没量到」。若把 0 判成放不下，
    // 每次换题都会先单列再跳成两列。放不下的那一帧本来也没有内容可错位。
    expect(fitsInHalf(0)).toBe(true)
  })
})

describe('结果区网格列定义', () => {
  it('并排时两轨等分，且都可收缩', () => {
    // 等分而非一轨定宽：定宽的窄轨会在宽窗口下留一大片空白，那正是「看起来对不齐」的来源。
    const t = tracks(resultGridColumns(true))
    expect(t).toHaveLength(2)
    expect(t[0]).toBe(t[1])
    assertShrinkable(t[0])
    assertShrinkable(t[1])
  })

  it('单列时一轨（DOM 顺序＝作答在前、快照在后，即「完整词条置底」）', () => {
    const t = tracks(resultGridColumns(false))
    expect(t).toHaveLength(1)
    assertShrinkable(t[0])
  })
})
