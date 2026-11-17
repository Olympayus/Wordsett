import { describe, it, expect } from 'vitest'
import { hitAreaStyle } from './hitArea'

describe('hitAreaStyle', () => {
  it('hitAreaStyle_null_on_non_touch', () => {
    expect(hitAreaStyle(false)).toBeNull()
    expect(hitAreaStyle(true)?.inset).toBeTruthy()
  })
})
