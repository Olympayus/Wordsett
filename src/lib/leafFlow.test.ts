import { describe, it, expect } from 'vitest'
import { isLeafFlow, LEAF_FLOW_MAX_CHARS } from './leafFlow'

const leaf = (value: string) => ({ value, childCount: 0 })
const box = (value: string, childCount: number) => ({ value, childCount })

describe('isLeafFlow（v0.7.3 §5.4：哪些容器该走一行多条）', () => {
  it('两条以上的短叶子 → 走多列', () => {
    expect(isLeafFlow([leaf('dine'), leaf('gorge'), leaf('have')])).toBe(true)
  })

  it('只有一条 → 不走（一条多列没有意义，还多一层包裹）', () => {
    expect(isLeafFlow([leaf('dine')])).toBe(false)
    expect(isLeafFlow([])).toBe(false)
  })

  it('带子节点的不走——它不是叶子容器', () => {
    expect(isLeafFlow([box('近义词', 3), leaf('dine')])).toBe(false)
  })

  it(`单值超过 ${LEAF_FLOW_MAX_CHARS} 字符的不走——整句例句也是「多条短叶子」，会被误并`, () => {
    const long = 'x'.repeat(LEAF_FLOW_MAX_CHARS + 1)
    expect(isLeafFlow([leaf('dine'), leaf(long)])).toBe(false)
  })

  it('刚好等于门槛的走（边界含等于）', () => {
    const atLimit = 'x'.repeat(LEAF_FLOW_MAX_CHARS)
    expect(isLeafFlow([leaf('dine'), leaf(atLimit)])).toBe(true)
  })

  it('空值不参与门槛判定，但也不因此放行带子节点的情况', () => {
    expect(isLeafFlow([leaf('dine'), leaf('')])).toBe(true)
  })
})
