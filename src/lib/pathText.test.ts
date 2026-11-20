// src/lib/pathText.test.ts
import { describe, it, expect } from 'vitest'
import { fileNameOnly } from './pathText'

describe('fileNameOnly（v0.8.0 iOS 导出成功文案）', () => {
  it('只取文件名', () => {
    expect(fileNameOnly('/var/mobile/Containers/Data/App/Documents/wordsett-backup-v0.8.0.json'))
      .toBe('wordsett-backup-v0.8.0.json')
    expect(fileNameOnly('E:\\backup.json')).toBe('backup.json')
  })
})
