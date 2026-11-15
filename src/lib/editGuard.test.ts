// src/lib/editGuard.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import {
  registerEditGuard, needsConfirmEditLeave, confirmLeaveEdit, withEditGuard,
  handleAppBlur, shouldInterceptEditClick, resetEditGuardForTests,
} from './editGuard'
import { useUiStore } from '../stores/uiStore'

const fakeGuard = (dirty: boolean) => {
  const calls = { discard: 0, silent: 0 }
  const off = registerEditGuard({
    isDirty: () => dirty,
    discard: () => { calls.discard++ },
    cancelSilently: () => { calls.silent++ },
  })
  return { calls, off }
}

beforeEach(() => {
  resetEditGuardForTests()
  useUiStore.setState({ confirmReq: null })
})

describe('editGuard', () => {
  it('无守卫时直接放行', async () => {
    expect(needsConfirmEditLeave()).toBe(false)
    await expect(confirmLeaveEdit()).resolves.toBe(true)
  })

  it('干净守卫失焦时静默退出编辑', () => {
    const g = fakeGuard(false)
    handleAppBlur()
    expect(g.calls.silent).toBe(1)
    g.off()
  })

  it('dirty 时弹一次确认，in-flight 去重，确认后只 discard 一次', async () => {
    const g = fakeGuard(true)
    const p1 = confirmLeaveEdit()
    const p2 = confirmLeaveEdit()
    expect(useUiStore.getState().confirmReq).toMatchObject({
      title: '有未保存的修改',
      message: '离开后这次编辑会丢失。',
      confirmLabel: '放弃修改',
      cancelLabel: '继续编辑',
      danger: true,
    })
    useUiStore.getState().resolveConfirm(true)
    await expect(p1).resolves.toBe(true)
    await expect(p2).resolves.toBe(true)
    expect(g.calls.discard).toBe(1)
    expect(needsConfirmEditLeave()).toBe(false)
    g.off()
  })

  it('拒绝时保持 dirty', async () => {
    const g = fakeGuard(true)
    const p = confirmLeaveEdit()
    useUiStore.getState().resolveConfirm(false)
    await expect(p).resolves.toBe(false)
    expect(g.calls.discard).toBe(0)
    expect(needsConfirmEditLeave()).toBe(true)
    g.off()
  })

  it('withEditGuard 在取消时不执行 action（复合导航中止）', async () => {
    const g = fakeGuard(true)
    let ran = 0
    const p = withEditGuard(() => { ran++ })
    useUiStore.getState().resolveConfirm(false)
    await p
    expect(ran).toBe(0)
    g.off()
  })

  it('withEditGuard 在干净时同步执行', () => {
    const g = fakeGuard(false)
    let ran = 0
    withEditGuard(() => { ran++ })
    expect(ran).toBe(1)
    g.off()
  })

  it('确认框打开时不拦截它自己的点击', () => {
    expect(shouldInterceptEditClick({ dirty: true, confirmOpen: true, inEditor: false, keep: false })).toBe(false)
    expect(shouldInterceptEditClick({ dirty: true, confirmOpen: false, inEditor: true, keep: false })).toBe(false)
    expect(shouldInterceptEditClick({ dirty: true, confirmOpen: false, inEditor: false, keep: true })).toBe(false)
    expect(shouldInterceptEditClick({ dirty: true, confirmOpen: false, inEditor: false, keep: false })).toBe(true)
  })
})
