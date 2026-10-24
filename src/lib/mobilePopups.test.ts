import { describe, it, expect, beforeEach } from 'vitest'
import { registerMobilePopup, closeTopMobilePopup, resetMobilePopups } from './mobilePopups'

describe('mobilePopups', () => {
  beforeEach(() => resetMobilePopups())

  it('没有浮层时返回 false（外壳应继续走优先级表）', () => {
    expect(closeTopMobilePopup()).toBe(false)
  })

  it('关闭后进的那一层（后进先出）', () => {
    const closed: string[] = []
    registerMobilePopup(() => closed.push('menu'))
    registerMobilePopup(() => closed.push('picker'))
    expect(closeTopMobilePopup()).toBe(true)
    expect(closed).toEqual(['picker'])
    expect(closeTopMobilePopup()).toBe(true)
    expect(closed).toEqual(['picker', 'menu'])
    expect(closeTopMobilePopup()).toBe(false)
  })

  it('注销后不再被关闭', () => {
    let closed = false
    const unregister = registerMobilePopup(() => { closed = true })
    unregister()
    expect(closeTopMobilePopup()).toBe(false)
    expect(closed).toBe(false)
  })

  it('注销只移除自己那一项', () => {
    const closed: string[] = []
    const first = registerMobilePopup(() => closed.push('first'))
    registerMobilePopup(() => closed.push('second'))
    first()
    expect(closeTopMobilePopup()).toBe(true)
    expect(closed).toEqual(['second'])
  })
})
