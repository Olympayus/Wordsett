// src/lib/tray/useCloseRequest.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

// `listen` / React 的 hook 在 node 环境里跑不了组件，但关窗流程的判定逻辑已经抽成
// `makeCloseRequestHandler`（每次挂载一份的普通闭包），可直接逐个调用——本文件测的就是它。
// `resolve_close_request` 是 Tauri 命令，必须 mock 掉：node 里没有 invoke。
const { resolveCloseRequestMock } = vi.hoisted(() => ({
  resolveCloseRequestMock: vi.fn(async (_toTray: boolean) => {}),
}))
vi.mock('../config', () => ({ resolveCloseRequest: resolveCloseRequestMock }))

import { makeCloseRequestHandler } from './useCloseRequest'
import { useUiStore } from '../../stores/uiStore'

beforeEach(() => {
  resolveCloseRequestMock.mockReset()
  resolveCloseRequestMock.mockResolvedValue(undefined)
  // 单 resolver 是模块级状态：结算掉上一轮可能残留的确认框。
  useUiStore.getState().resolveConfirm(false)
  useUiStore.setState({ confirmReq: null })
})

describe('makeCloseRequestHandler', () => {
  it('单次请求：选「最小化到托盘」→ resolveCloseRequest(true)', async () => {
    const handler = makeCloseRequestHandler()
    const pending = handler()
    expect(useUiStore.getState().confirmReq?.title).toBe('关闭主窗口？')
    useUiStore.getState().resolveConfirm(true)
    await pending
    expect(resolveCloseRequestMock).toHaveBeenCalledTimes(1)
    expect(resolveCloseRequestMock).toHaveBeenCalledWith(true)
  })

  it('弹窗打开时再来一次 close-requested：旧流程不把「被覆盖」当成退出', async () => {
    // v0.7.8 Task 7 修复轮 2 的回归：`close_dialog_seen` 要等 resolve_close_request 才落盘，
    // 所以弹窗开着时再按 Alt+F4 会再 emit 一次。第二次 confirm 把第一次以 false 结算，
    // 而 false 在关窗弹窗里等于「直接退出」——旧流程必须凭序号认领这次覆盖并放弃，
    // 否则会静默退出并持久化 close_to_tray=false。
    const handler = makeCloseRequestHandler()
    const first = handler()
    const second = handler()
    // 用户只在可见的第二个弹窗上点「最小化到托盘」。
    useUiStore.getState().resolveConfirm(true)
    await second
    await first
    expect(resolveCloseRequestMock).toHaveBeenCalledTimes(1)
    expect(resolveCloseRequestMock).toHaveBeenCalledWith(true)
  })

  it('连续两次请求后选「直接退出」：只结算一次 false', async () => {
    const handler = makeCloseRequestHandler()
    const first = handler()
    const second = handler()
    useUiStore.getState().resolveConfirm(false)
    await second
    await first
    expect(resolveCloseRequestMock).toHaveBeenCalledTimes(1)
    expect(resolveCloseRequestMock).toHaveBeenCalledWith(false)
  })
})
