import { describe, expect, it } from 'vitest'
import { dbReadyAction, pragmaStatements } from './dbReady'

describe('dbReadyAction', () => {
  it('waits for app-ready before the timeout, then connects anyway', () => {
    expect(dbReadyAction({ appReady: false, attempted: false, elapsedMs: 100 })).toBe('wait')
    expect(dbReadyAction({ appReady: false, attempted: false, elapsedMs: 4000 })).toBe('connect')
  })

  it('retries exactly once', () => {
    expect(dbReadyAction({ appReady: true, attempted: false, elapsedMs: 10 })).toBe('retry')
    expect(dbReadyAction({ appReady: true, attempted: true, elapsedMs: 10 })).toBe('fail')
  })
})

describe('pragmaStatements', () => {
  it('pragmas put busy_timeout before WAL', () => {
    expect(pragmaStatements()).toEqual(['PRAGMA busy_timeout = 5000', 'PRAGMA journal_mode = WAL'])
  })
})
