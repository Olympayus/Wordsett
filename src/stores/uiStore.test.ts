import { describe, it, expect, beforeEach } from 'vitest'
import { useUiStore } from './uiStore'

describe('uiStore 统一模态宿主', () => {
  beforeEach(() => useUiStore.setState({ assignWordId: null, editorTarget: null }))

  it('openAssign 打开分配分类，且关闭编辑模态', () => {
    useUiStore.getState().openEditor({ id: 'c1', name: 'A', color: '#fff', description: null, isDefault: false } as any, 'w1')
    useUiStore.getState().openAssign('w2')
    const s = useUiStore.getState()
    expect(s.assignWordId).toBe('w2')
    expect(s.editorTarget).toBeNull()
  })

  it('openEditor 记录目标，且关闭分配模态', () => {
    useUiStore.getState().openEditor(null, 'w1')
    const s = useUiStore.getState()
    expect(s.editorTarget).toEqual({ category: null, wordId: 'w1' })
    expect(s.assignWordId).toBeNull()
  })

  it('closeModals 全部关闭', () => {
    useUiStore.getState().openAssign('w1')
    useUiStore.getState().closeModals()
    const s = useUiStore.getState()
    expect(s.assignWordId).toBeNull()
    expect(s.editorTarget).toBeNull()
  })
})

describe('confirm', () => {
  // 每个用例开始前清掉上一轮可能残留的确认框（单 resolver 是模块级状态，不随 store 重置）。
  beforeEach(() => {
    useUiStore.getState().resolveConfirm(false)
    useUiStore.setState({ confirmReq: null })
  })

  it('confirm 返回 Promise，resolveConfirm(true) 后 resolve true 并清空', async () => {
    useUiStore.setState({ confirmReq: null })
    const p = useUiStore.getState().confirm({ title: '删除', message: '确定？', danger: true })
    expect(useUiStore.getState().confirmReq?.title).toBe('删除')
    useUiStore.getState().resolveConfirm(true)
    await expect(p).resolves.toBe(true)
    expect(useUiStore.getState().confirmReq).toBeNull()
  })

  it('resolveConfirm(false) resolve false', async () => {
    const p = useUiStore.getState().confirm({ title: 't', message: 'm' })
    useUiStore.getState().resolveConfirm(false)
    await expect(p).resolves.toBe(false)
  })

  it('新确认框覆盖未结算的旧确认框时，旧 Promise 以 false 结算，新确认框照常可用', async () => {
    // v0.7.8 Task 7 的回归：编辑确认框（有未保存修改）打开时触发系统级关窗，
    // 关窗弹窗会覆盖 confirmReq。旧 Promise 若不结算，editGuard 的 inflight 永不归零，
    // 关窗流程与所有入口守卫会静默挂起。
    const editConfirm = useUiStore.getState().confirm({
      title: '有未保存的修改',
      message: '离开后这次编辑会丢失。',
      confirmLabel: '放弃修改',
      cancelLabel: '继续编辑',
      danger: true,
    })
    const closeConfirm = useUiStore.getState().confirm({
      title: '关闭主窗口？',
      message: '选「最小化到托盘」后窗口可随时从托盘图标找回。',
      confirmLabel: '最小化到托盘',
      cancelLabel: '直接退出',
      dismissable: false,
    })
    // 旧框按「取消」结算（等价于用户点了「继续编辑」——编辑态保留）。
    await expect(editConfirm).resolves.toBe(false)
    // 新框仍在，且自己能正常结算。
    expect(useUiStore.getState().confirmReq?.title).toBe('关闭主窗口？')
    useUiStore.getState().resolveConfirm(false)
    await expect(closeConfirm).resolves.toBe(false)
    expect(useUiStore.getState().confirmReq).toBeNull()
  })
})
