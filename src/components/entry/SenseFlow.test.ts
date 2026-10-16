import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./SenseFlow.tsx', import.meta.url), 'utf8')
const card = readFileSync(new URL('../search/DictDetailCard.tsx', import.meta.url), 'utf8')

// v0.7.3 §5.3：返回页的「词性 → 义项」要像工作区那样不缩进——词性头落在 11px，
// 与义项的**义号槽**同一条竖线（正文仍在 29 = 11 + 18）。
// 工作区那处本来就是 11px（WordWorkbench 的 groupHead），故不在本测试范围。
describe('run-in 头的左内距（v0.7.3 §5.3）', () => {
  it('SenseFlow 的默认头带 11px 左内距', () => {
    expect(src).toMatch(/paddingLeft: '11px'/)
  })

  it('返回页自绘头带 11px 左内距', () => {
    expect(card).toMatch(/padding(Left)?: '11px'/)
  })

  it('工作区的 groupHead **不得**再叠一次 11px（它本来就是 11）', () => {
    const wb = readFileSync(new URL('../word/WordWorkbench.tsx', import.meta.url), 'utf8')
    expect(wb).toMatch(/padding: '2px 0 2px 11px'/)
    expect(wb).not.toMatch(/padding: '2px 0 2px 22px'/)
  })
})
