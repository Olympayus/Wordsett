import { describe, expect, it } from 'vitest'
import { RETRY_WAIT_MS, retrySequence } from './collectorRetry'

describe('collectorRetry', () => {
  it('retry_sequence_hides_waits_reads_then_shows', () => {
    expect(retrySequence()).toEqual(['hide', 'wait', 'read', 'show'])
  })

  it('wait_step_is_120ms', () => {
    expect(RETRY_WAIT_MS).toBe(120)
  })
})
