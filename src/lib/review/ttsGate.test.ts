import { describe, it, expect, beforeEach } from 'vitest'
import { isListenEnabled, setListenEnabled, resetListenEnabled } from './ttsGate'

describe('lib/review/ttsGate', () => {
  beforeEach(() => resetListenEnabled())

  it('默认关闭：探测返回前不得放行听辨题', () => {
    expect(isListenEnabled()).toBe(false)
  })

  it('置位后开启，可复位', () => {
    setListenEnabled(true)
    expect(isListenEnabled()).toBe(true)
    resetListenEnabled()
    expect(isListenEnabled()).toBe(false)
  })
})
