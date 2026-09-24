import { create } from 'zustand'

export type ActiveView = 'workbench' | 'dict'
export type ActiveModule = 'workbench' | 'review' | 'settings'

interface ViewStore {
  activeModule: ActiveModule
  activeView: ActiveView
  dictWord: string | null
  editorMode: boolean
  showModule: (m: ActiveModule) => void
  showWorkbench: () => void
  showDict: (word: string) => void
  setEditorMode: (on: boolean) => void
}

export const useViewStore = create<ViewStore>((set) => ({
  activeModule: 'workbench',
  activeView: 'workbench',
  dictWord: null,
  editorMode: false,
  showModule: (m) => set({ activeModule: m }),
  // 全局入口（顶栏 Logo / 搜索建议）触发的是工作台内导航，须同时把模块切回工作台（v0.5.2 §7）：
  // 否则设置页激活时只改隐藏子树的 activeView/dictWord，界面毫无反应，
  // 且用户点「工作台」会落到一个自己没请求过的词典页。showModule 仍是唯一能选设置模块的入口。
  showWorkbench: () => set({ activeModule: 'workbench', activeView: 'workbench', dictWord: null }),
  showDict: (word) => set({ activeModule: 'workbench', activeView: 'dict', dictWord: word }),
  setEditorMode: (on) => set({ editorMode: on }),
}))