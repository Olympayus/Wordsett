import { describe, it, expect, beforeEach } from 'vitest'
import { useViewStore } from './viewStore'

describe('viewStore 双视图切换（D2）', () => {
  beforeEach(() => {
    useViewStore.setState({ activeView: 'workbench', dictWord: null, activeModule: 'workbench' })
  })

  it('初始为词编辑视图', () => {
    const s = useViewStore.getState()
    expect(s.activeView).toBe('workbench')
    expect(s.dictWord).toBeNull()
  })

  it('showDict 切到词典详情视图并记录单词', () => {
    useViewStore.getState().showDict('observe')
    const s = useViewStore.getState()
    expect(s.activeView).toBe('dict')
    expect(s.dictWord).toBe('observe')
  })

  it('showWorkbench 回到词编辑视图并清空 dictWord', () => {
    useViewStore.getState().showDict('observe')
    useViewStore.getState().showWorkbench()
    const s = useViewStore.getState()
    expect(s.activeView).toBe('workbench')
    expect(s.dictWord).toBeNull()
  })

  it('showDict 连续替换词典单词', () => {
    useViewStore.getState().showDict('observe')
    useViewStore.getState().showDict('ball')
    expect(useViewStore.getState().dictWord).toBe('ball')
  })

  it('editorMode 初始 false，setEditorMode 切换', () => {
    expect(useViewStore.getState().editorMode).toBe(false)
    useViewStore.getState().setEditorMode(true)
    expect(useViewStore.getState().editorMode).toBe(true)
    useViewStore.getState().setEditorMode(false)
    expect(useViewStore.getState().editorMode).toBe(false)
  })

  it('activeModule 初始为 workbench，showModule 切换模块', () => {
    useViewStore.setState({ activeModule: 'workbench' })
    expect(useViewStore.getState().activeModule).toBe('workbench')
    useViewStore.getState().showModule('settings')
    expect(useViewStore.getState().activeModule).toBe('settings')
    useViewStore.getState().showModule('workbench')
    expect(useViewStore.getState().activeModule).toBe('workbench')
  })

  // 设置页激活时，顶栏搜索建议 / Logo 是全局入口，须把模块带回工作台（v0.5.2 全局入口修复）
  it('showDict 在设置模块下同时切回工作台模块', () => {
    useViewStore.getState().showModule('settings')
    useViewStore.getState().showDict('observe')
    const s = useViewStore.getState()
    expect(s.activeModule).toBe('workbench')
    expect(s.activeView).toBe('dict')
    expect(s.dictWord).toBe('observe')
  })

  it('showWorkbench 在设置模块下同时切回工作台模块', () => {
    useViewStore.getState().showModule('settings')
    useViewStore.getState().showWorkbench()
    const s = useViewStore.getState()
    expect(s.activeModule).toBe('workbench')
    expect(s.activeView).toBe('workbench')
    expect(s.dictWord).toBeNull()
  })

  it('showModule 仍是唯一能选设置模块的入口', () => {
    useViewStore.getState().showModule('settings')
    expect(useViewStore.getState().activeModule).toBe('settings')
  })
})
