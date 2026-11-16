import { describe, it, expect } from 'vitest'
import { eventToAccelerator, formatAccelerator } from './hotkey'

// v0.7.9 Task 16：录制控件把用户按下的组合键转成 accelerator（与 Rust `shortcut::validate`
// 同一套形状）。纯函数 + 假事件，`environment: 'node'` 下即可驱动。
describe('hotkey', () => {
  it('event_to_accelerator_requires_modifier_and_supported_key', () => {
    const e = (code: string, mods: Partial<KeyboardEvent>) => ({ code, ...mods }) as KeyboardEvent
    expect(eventToAccelerator(e('KeyK', { ctrlKey: true }))).toBe('Control+KeyK')
    expect(eventToAccelerator(e('KeyK', { altKey: true, shiftKey: true }))).toBe('Alt+Shift+KeyK')
    expect(eventToAccelerator(e('KeyK', {}))).toBeNull()
    expect(eventToAccelerator(e('IntlBackslash', { altKey: true }))).toBeNull()
    expect(eventToAccelerator(e('Escape', { altKey: true }))).toBeNull()
  })
  it('formats_keycaps', () => {
    expect(formatAccelerator('Option+KeyW')).toEqual(['Option', 'W'])
  })
})
