import { describe, it, expect, beforeEach, vi } from 'vitest'
import { isListenEnabled, setProbe, resetListenEnabled, subscribe, getProbe } from './ttsGate'

describe('ttsGate', () => {
  beforeEach(() => resetListenEnabled())

  it('探测前一律不可用（fail-closed）', () => {
    expect(isListenEnabled()).toBe(false)
    expect(getProbe()).toBeNull()
  })

  it('available 为真才放行', () => {
    setProbe({ available: true, backend: 'sapi', voice: 'Microsoft Zira Desktop', reason: null })
    expect(isListenEnabled()).toBe(true)
  })

  it('available 为假时即使带后端名也不放行', () => {
    // 钉住判据只看 available：将来若有人把 isListenEnabled 改成 `probe !== null`，
    // 一张播放无声的听辨卡就会被放出去。
    setProbe({ available: false, backend: 'sapi', voice: null, reason: '没有英文音色' })
    expect(isListenEnabled()).toBe(false)
  })

  it('订阅者收到状态变更通知', () => {
    const fn = vi.fn()
    const off = subscribe(fn)
    setProbe({ available: true, backend: 'winrt', voice: 'Zira', reason: null })
    expect(fn).toHaveBeenCalledTimes(1)
    resetListenEnabled()
    expect(fn).toHaveBeenCalledTimes(2)
    off()
    setProbe(null)
    expect(fn).toHaveBeenCalledTimes(2)   // 退订后不再收到
  })

  it('订阅者抛错不影响其他订阅者与状态写入', () => {
    const bad = () => { throw new Error('boom') }
    const good = vi.fn()
    subscribe(bad)
    subscribe(good)
    expect(() => setProbe({ available: true, backend: 'sapi', voice: 'Z', reason: null })).not.toThrow()
    expect(good).toHaveBeenCalled()
  })
})
