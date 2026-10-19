import { describe, it, expect } from 'vitest'
import { MEASURE_INPUT_CLASS, MEASURE_STYLE, MEASURE_MIN_WIDTH, measureTextWidth } from './measureText'

describe('measureTextWidth / 探针常量（v0.7.4 任务 14 的量宽契约）', () => {
  it('量的是 border-box 宽（调用方原样写进 input 的 style.width），并向上取整', () => {
    const el = { getBoundingClientRect: () => ({ width: 137.4 }) } as unknown as HTMLElement
    expect(measureTextWidth(el)).toBe(138)   // 向上取整：宁可宽 1px，不可裁字
  })

  it('量不到（未挂载 / 隐藏）时返回 0，让调用方回落 minWidth', () => {
    expect(measureTextWidth(null)).toBe(0)
    const hidden = { getBoundingClientRect: () => ({ width: 0 }) } as unknown as HTMLElement
    expect(measureTextWidth(hidden)).toBe(0)
  })

  it('探针样式与宽度下限是同一份常量，与输入框两侧不可能漂移', () => {
    expect(MEASURE_STYLE.position).toBe('absolute')      // 不能用 display:none（量不到）
    expect(MEASURE_STYLE.visibility).toBe('hidden')
    expect(MEASURE_INPUT_CLASS).toContain('px-3')        // 与输入框 className 里的 px-3 同一个类
    expect(MEASURE_STYLE.border).toBe('1px solid var(--color-brand)')
    expect(MEASURE_MIN_WIDTH).toBe('4em')
  })
})
