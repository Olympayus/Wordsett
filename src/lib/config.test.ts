// src/lib/config.test.ts
import { describe, it, expect, vi } from 'vitest'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

import { resolveCloseRequest } from './config'

describe('resolveCloseRequest', () => {
  // 这个断言的全部意义就是钉住参数名。Tauri v2 按 camelCase 把 JS 参数映射到 Rust 的
  // `close_to_tray`；写成 `close_to_tray` 既不报 tsc 错也过不了 Rust 编译，只在运行时的
  // 关窗路径上炸——那条路径低频到足以漏过手工 QA。所以必须在单测里钉死。
  it('参数名必须是 closeToTray（camelCase），映射到 Rust 的 close_to_tray', async () => {
    invokeMock.mockReset()
    invokeMock.mockResolvedValue(undefined)
    await resolveCloseRequest(true)
    expect(invokeMock).toHaveBeenCalledWith('resolve_close_request', { closeToTray: true })
  })
})