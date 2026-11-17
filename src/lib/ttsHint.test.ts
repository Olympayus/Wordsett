import { describe, it, expect } from 'vitest'
import { ttsInstallHint } from './ttsHint'

describe('ttsInstallHint', () => {
  it('ttsInstallHint_android', () => {
    expect(ttsInstallHint('android-phone')).toContain('文字转语音')
    expect(ttsInstallHint('android-tablet')).toContain('文字转语音')
    expect(ttsInstallHint('desktop')).toBeNull()
  })
})
