import { create } from 'zustand'

export type ActiveView = 'workbench' | 'dict'
export type ActiveModule = 'workbench' | 'settings'

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
  showWorkbench: () => set({ activeView: 'workbench', dictWord: null }),
  showDict: (word) => set({ activeView: 'dict', dictWord: word }),
  setEditorMode: (on) => set({ editorMode: on }),
}))