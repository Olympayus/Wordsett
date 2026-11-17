import { describe, it, expect } from 'vitest'
import { flipDelta } from './flip'

// FLIP 收敛动画（v0.7.10 任务 8）：`playFlip` 是浏览器 DOM 行为，仓库的 vitest 只有 node 环境、
// 不装组件测试 harness，故只钉纯函数这一层——位移方向与「取反」语义。
describe('flipDelta（v0.7.10 任务 8）', () => {
  it('flipDelta_returns_inverse_translation', () => {
    expect(flipDelta({ left: 0, top: 100 }, { left: 0, top: 40 })).toEqual({ dx: 0, dy: 60 })
  })
})
