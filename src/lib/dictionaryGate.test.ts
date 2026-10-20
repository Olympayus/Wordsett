import { describe, it, expect } from 'vitest'
import { gateModel } from './dictionaryGate'

describe('dictionaryGate', () => {
  it('ready 不阻塞', () => {
    expect(gateModel({ ready: true, copied: false, target: '/data' }, null)).toEqual({ blocking: false, label: '', canRetry: false })
  })
  it('error 阻塞且可重试', () => {
    expect(gateModel(null, '磁盘空间不足')).toEqual({ blocking: true, label: '磁盘空间不足', canRetry: true })
  })
  it('未完成时显示准备文案', () => {
    expect(gateModel(null, null)).toEqual({ blocking: true, label: '正在准备词典…', canRetry: false })
  })
})
