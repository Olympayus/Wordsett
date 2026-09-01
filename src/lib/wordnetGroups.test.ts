import { describe, it, expect } from 'vitest'
import { freshGroups, RELATED_GROUP_KEYS } from './wordnetGroups'

describe('freshGroups', () => {
  it('每次调用逐一返回全新的独立数组（修复语义网络跨词累加回归）', () => {
    const a = freshGroups()
    const b = freshGroups()
    // 浅拷贝共享引用时 a/b 各键是同一数组；此断言在旧的 `{ ...emptyGroups }` 下失败
    expect(a).not.toBe(b)
    for (const key of RELATED_GROUP_KEYS) {
      expect(a[key]).not.toBe(b[key])
      b[key].push({ words: ['cell'] })
      expect(a[key]).toEqual([])
    }
  })
})