import { describe, it, expect, vi } from 'vitest'
import { speakWord } from './speak'

describe('speakWord（v0.6.3 条目 12）', () => {
  it('把词与语速传给 speak 命令', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined)
    await speakWord('detrimental', invoke)
    expect(invoke).toHaveBeenCalledWith('speak', { text: 'detrimental', rate: 1.0 })
  })

  it('空文本直接返回，不调命令', async () => {
    const invoke = vi.fn()
    await speakWord('', invoke)
    expect(invoke).not.toHaveBeenCalled()
  })

  it('命令失败时静默吞掉——系统没装英文音色就是这条路径，不能让调用方看到 reject', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('no english voice'))
    await expect(speakWord('detrimental', invoke)).resolves.toBeUndefined()
  })

  it('报错也不写 console，避免每次点都刷一条（静默降级是有意的，不是故障）', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const invoke = vi.fn().mockRejectedValue(new Error('boom'))
    await speakWord('detrimental', invoke)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
