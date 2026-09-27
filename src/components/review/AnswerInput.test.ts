import { describe, it, expect } from 'vitest'
import { choiceColumns } from './AnswerInput'

describe('choiceColumns（v0.6.3 条目 8 的回落判据）', () => {
  const LINE = 33

  it('选项都没换行 → 2 列（四宫格）', () => {
    expect(choiceColumns([LINE, LINE, LINE, LINE], LINE)).toBe(2)
  })

  it('任一选项换行 → 1 列（整组回落 1×4）', () => {
    // 只有第二项高，也必须整组回落——半张 2×2 半张 1×4 会让选项宽度不一致
    expect(choiceColumns([LINE, LINE * 2, LINE, LINE], LINE)).toBe(1)
  })

  it('末项换行同样整组回落（不是只看第一项）', () => {
    expect(choiceColumns([LINE, LINE, LINE, LINE * 3], LINE)).toBe(1)
  })

  it('空列表 → 2 列（版式不因有没有选项而变）', () => {
    expect(choiceColumns([], LINE)).toBe(2)
  })
})
