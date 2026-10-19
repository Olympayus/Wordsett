import { describe, it, expect } from 'vitest'
import { editKeyDown } from './editKeyDown'

// 键盘契约（v0.7.4 任务 14）：单行 Enter 即保存；多行 Enter 保存、Shift+Enter 换行；Esc 取消；
// 输入法上屏的那一下 Enter 什么都不做（isComposing 守卫——不拦住会把正在输入的拼音当成保存）。
// 纯函数 + 假事件，`environment: 'node'` 下即可驱动。
type FakeKey = { key: string; shiftKey: boolean; isComposing?: boolean }

const run = (fieldType: 'text' | 'multiline', e: FakeKey) => {
  const saved: string[] = []
  const cancelled: string[] = []
  const prevented: string[] = []
  editKeyDown(fieldType, () => saved.push('save'), () => cancelled.push('cancel'))({
    key: e.key,
    shiftKey: e.shiftKey,
    nativeEvent: { isComposing: e.isComposing ?? false },
    preventDefault: () => prevented.push('prevented'),
  })
  return { saved, cancelled, prevented }
}

describe('editKeyDown（v0.7.4 任务 14 的键盘契约）', () => {
  it('单行：Enter 保存（并拦掉默认行为）', () => {
    const r = run('text', { key: 'Enter', shiftKey: false })
    expect(r.saved).toEqual(['save'])
    expect(r.cancelled).toEqual([])
    expect(r.prevented).toEqual(['prevented'])
  })

  it('多行：Enter 保存；Shift+Enter 只换行、不保存', () => {
    expect(run('multiline', { key: 'Enter', shiftKey: false }).saved).toEqual(['save'])
    const shift = run('multiline', { key: 'Enter', shiftKey: true })
    expect(shift.saved).toEqual([])
    expect(shift.cancelled).toEqual([])
    expect(shift.prevented).toEqual([])
  })

  it('Esc 一律取消（两种字段形态都一样）', () => {
    for (const t of ['text', 'multiline'] as const) {
      const r = run(t, { key: 'Escape', shiftKey: false })
      expect(r.cancelled).toEqual(['cancel'])
      expect(r.saved).toEqual([])
    }
  })

  it('输入法上屏的那一下 Enter 什么都不做（isComposing 守卫）', () => {
    for (const t of ['text', 'multiline'] as const) {
      const r = run(t, { key: 'Enter', shiftKey: false, isComposing: true })
      expect(r.saved).toEqual([])
      expect(r.cancelled).toEqual([])
      expect(r.prevented).toEqual([])
    }
  })

  it('输入法组合中的 Esc 同样不取消', () => {
    expect(run('text', { key: 'Escape', shiftKey: false, isComposing: true }).cancelled).toEqual([])
  })

  it('其余按键（字母、空格）不触发任何动作', () => {
    const r = run('text', { key: ' ', shiftKey: false })
    expect(r.saved).toEqual([])
    expect(r.cancelled).toEqual([])
    expect(r.prevented).toEqual([])
  })
})
