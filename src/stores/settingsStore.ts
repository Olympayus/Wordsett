import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { SidebarMode } from '../lib/sidebar'

export type DisplayFieldKey =
  | 'phonetic' | 'part_of_speech' | 'chinese_definition'
  | 'english_definition' | 'example' | 'exchange' | 'synonyms'
  | 'derivatives'

export type DictionaryKey = 'ecdict' | 'wordnet'

export type TitleInfoKey =
  | 'showBadges' | 'showPhonetic' | 'showWordRoot'
  | 'showCollinsStars'
  | 'showDomainCategory' | 'showDomainRegion' | 'showDomainUsage'

export interface SettingsStore {
  displayFields: Record<DisplayFieldKey, boolean>
  dictionaries: Record<DictionaryKey, boolean>
  sidebarMode: SidebarMode
  titleInfo: Record<TitleInfoKey, boolean>
  setDisplayField: (key: DisplayFieldKey, on: boolean) => void
  setDictionary: (key: DictionaryKey, on: boolean) => void
  setSidebarMode: (mode: SidebarMode) => void
  setTitleInfo: (key: TitleInfoKey, on: boolean) => void
}

// 默认（规格 §7）：词典返回词条全开（含词源相关词）、本地词典全开、字母模式
const DEFAULT_DISPLAY_FIELDS: Record<DisplayFieldKey, boolean> = {
  phonetic: true, part_of_speech: true, chinese_definition: true,
  english_definition: true, example: true, exchange: true, synonyms: true,
  derivatives: true,
}
const DEFAULT_DICTIONARIES: Record<DictionaryKey, boolean> = { ecdict: true, wordnet: true }
export const DEFAULT_TITLE_INFO: Record<TitleInfoKey, boolean> = {
  showBadges: true, showPhonetic: true, showWordRoot: true,
  showCollinsStars: true,
  showDomainCategory: true, showDomainRegion: true, showDomainUsage: true,
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      displayFields: DEFAULT_DISPLAY_FIELDS,
      dictionaries: DEFAULT_DICTIONARIES,
      sidebarMode: 'alphabet',
      titleInfo: DEFAULT_TITLE_INFO,
      setDisplayField: (key, on) => set(s => ({ displayFields: { ...s.displayFields, [key]: on } })),
      setDictionary: (key, on) => set(s => ({ dictionaries: { ...s.dictionaries, [key]: on } })),
      setSidebarMode: (mode) => set({ sidebarMode: mode }),
      setTitleInfo: (key, on) => set(s => ({ titleInfo: { ...s.titleInfo, [key]: on } })),
    }),
    {
      name: 'wordsett-settings',
      version: 4,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Partial<SettingsStore> & { displayFields?: Record<string, boolean> }
        const fields: Record<string, boolean> = { ...DEFAULT_DISPLAY_FIELDS, ...(state.displayFields) }
        delete fields.etymology
        if (fields.synonyms === undefined) fields.synonyms = true
        const dictionaries: Record<DictionaryKey, boolean> = { ...DEFAULT_DICTIONARIES, ...(state.dictionaries) }
        const titleInfo: Record<TitleInfoKey, boolean> = { ...DEFAULT_TITLE_INFO, ...state.titleInfo }
        return { ...state, displayFields: fields, dictionaries, titleInfo } as SettingsStore
      },
      onRehydrateStorage: () => (_, error) => {
        if (error) {
          // 损坏/缺失数据 → 回退默认值
          useSettingsStore.setState({
            displayFields: DEFAULT_DISPLAY_FIELDS,
            dictionaries: DEFAULT_DICTIONARIES,
            sidebarMode: 'alphabet',
            titleInfo: DEFAULT_TITLE_INFO,
          })
        }
      },
      partialize: (s) => ({
        displayFields: s.displayFields,
        dictionaries: s.dictionaries,
        sidebarMode: s.sidebarMode,
        titleInfo: s.titleInfo,
      }),
    }
  )
)
