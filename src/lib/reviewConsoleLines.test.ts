import { describe, expect, it } from 'vitest'
import { consoleLines, type ConsoleLine } from './reviewConsoleLines'

const flat = (l: ConsoleLine) => l.map(s => s.text).join('')
const o = { total: 19, dueWordCount: 12, deliverable: 10, newCount: 5 }

describe('consoleLines（v0.7.3 尾段 §5：一行一个量）', () => {
  it('四行，顺序是 待复习 / 覆盖 / 本轮可出 / 新词·薄弱词', () => {
    expect(consoleLines(o, 6).map(flat)).toEqual([
      '待复习 19 张', '覆盖 12 个词', '本轮可出 10 道', '新词: 5 个　薄弱词: 6 个',
    ])
  })
  it('数字单独成段，组件才套得上 .stat-num', () => {
    const lines = consoleLines(o, 6)
    expect(lines[0]).toEqual([
      { kind: 'label', text: '待复习 ' }, { kind: 'num', text: '19' }, { kind: 'label', text: ' 张' },
    ])
    expect(lines[3].filter(s => s.kind === 'num').map(s => s.text)).toEqual(['5', '6'])
  })
  it('薄弱词为 0 时那一句照样在（不是条件渲染）', () => {
    expect(flat(consoleLines(o, 0)[3])).toBe('新词: 5 个　薄弱词: 0 个')
  })
})
