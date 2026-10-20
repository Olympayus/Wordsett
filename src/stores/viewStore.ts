import { create } from 'zustand'

export type ActiveView = 'workbench' | 'dict'
export type ActiveModule = 'workbench' | 'archive' | 'search' | 'review' | 'settings'

/** 关闭搜索模块时恢复的现场：来源模块 + 当时的视图与词典词。 */
export interface SearchReturn {
  activeModule: Exclude<ActiveModule, 'search'>
  activeView: ActiveView
  dictWord: string | null
}

interface ViewStore {
  activeModule: ActiveModule
  activeView: ActiveView
  dictWord: string | null
  editorMode: boolean
  /** 进入搜索模块前的现场，`closeSearch` 据此回到来源；未进入搜索时为 null。 */
  searchReturn: SearchReturn | null
  showModule: (m: ActiveModule) => void
  showWorkbench: () => void
  /** 只把右侧切回词编辑视图，**不动模块**（v0.7.5 Task 10：储藏库复用工作台 DOM）。 */
  showWorkbenchView: () => void
  showDict: (word: string) => void
  setEditorMode: (on: boolean) => void
  /** 进入搜索模块：记住来源模块与当前视图，切到搜索。 */
  openSearch: () => void
  /** 离开搜索模块：有保存值则恢复并清空 searchReturn，否则回工作台。 */
  closeSearch: () => void
  /** 搜索结果里点词条：保持 search 模块，切到词典详情视图。 */
  openDictFromSearch: (word: string) => void
  /** 从词典详情回到搜索结果列表：切回词编辑视图、清空 dictWord。 */
  showSearchResults: () => void
}

export const useViewStore = create<ViewStore>((set, get) => ({
  activeModule: 'workbench',
  activeView: 'workbench',
  dictWord: null,
  editorMode: false,
  searchReturn: null,
  showModule: (m) => set({ activeModule: m }),
  // 全局入口（顶栏 Logo / 搜索建议）触发的是工作台内导航，须同时把模块切回工作台（v0.5.2 §7）：
  // 否则设置页激活时只改隐藏子树的 activeView/dictWord，界面毫无反应，
  // 且用户点「工作台」会落到一个自己没请求过的词典页。showModule 仍是唯一能选设置模块的入口。
  showWorkbench: () => set({ activeModule: 'workbench', activeView: 'workbench', dictWord: null }),
  // 储藏库模块（v0.7.5 Task 10）复用工作台这一层 DOM，侧栏点词条 / 右键「编辑」只该切回
  // 词编辑视图：用 showWorkbench 会连模块一起拨回工作台，用户点一下储藏库里的词就被送走。
  showWorkbenchView: () => set({ activeView: 'workbench', dictWord: null }),
  showDict: (word) => set({ activeModule: 'workbench', activeView: 'dict', dictWord: word }),
  setEditorMode: (on) => set({ editorMode: on }),
  // 移动搜索模块（Task 2）：记住来源，closeSearch 据此恢复。
  openSearch: () => {
    const { activeModule, activeView, dictWord, searchReturn } = get()
    // 已在搜索模块内再次 openSearch：保留现有 searchReturn 不动（原始来源不丢），
    // 仍把视图重置为搜索列表。
    const nextReturn = activeModule === 'search' && searchReturn
      ? searchReturn
      : { activeModule: activeModule === 'search' ? 'workbench' : activeModule, activeView, dictWord }
    set({ activeModule: 'search', activeView: 'workbench', dictWord: null, searchReturn: nextReturn })
  },
  closeSearch: () => {
    const { searchReturn } = get()
    if (searchReturn) {
      set({ ...searchReturn, searchReturn: null })
    } else {
      set({ activeModule: 'workbench', activeView: 'workbench', dictWord: null, searchReturn: null })
    }
  },
  openDictFromSearch: (word) => set({ activeModule: 'search', activeView: 'dict', dictWord: word }),
  showSearchResults: () => set({ activeView: 'workbench', dictWord: null }),
}))