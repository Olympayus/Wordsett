import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { SidebarMode } from '../lib/sidebar'
import { LOCKED_SMART_VIEW, type SmartViewKey } from '../lib/smartViews'

export type DisplayFieldKey =
  | 'phonetic' | 'part_of_speech' | 'chinese_definition'
  | 'english_definition' | 'example' | 'exchange' | 'synonyms'
  | 'derivatives'

export type TitleInfoKey =
  | 'showBadges' | 'showPhonetic' | 'showWordRoot'
  | 'showCollinsStars'
  | 'showDomainCategory' | 'showDomainRegion' | 'showDomainUsage'

export interface ReviewSettings {
  retention: number
  leechThreshold: number
  newCardQuota: number
  queueLimit: number
  letterHighlight: boolean
  /** 标题栏是否显示待复习数量 chip（v0.6.3 条目 5）。默认开。 */
  showDueBadge: boolean
}

export interface SettingsStore {
  displayFields: Record<DisplayFieldKey, boolean>
  sidebarMode: SidebarMode
  titleInfo: Record<TitleInfoKey, boolean>
  review: ReviewSettings
  /** 侧栏四个智能视图逐项开关（v0.6.5 §4.4）。`all` 恒为 true，见 setSmartView。 */
  smartViews: Record<SmartViewKey, boolean>
  setDisplayField: (key: DisplayFieldKey, on: boolean) => void
  setSidebarMode: (mode: SidebarMode) => void
  setTitleInfo: (key: TitleInfoKey, on: boolean) => void
  setReview: <K extends keyof ReviewSettings>(key: K, value: ReviewSettings[K]) => void
  setSmartView: (key: SmartViewKey, on: boolean) => void
}

// 默认（规格 §7）：词典返回词条全开（含词源相关词）、字母模式
const DEFAULT_DISPLAY_FIELDS: Record<DisplayFieldKey, boolean> = {
  phonetic: true, part_of_speech: true, chinese_definition: true,
  english_definition: true, example: true, exchange: true, synonyms: true,
  derivatives: true,
}
export const DEFAULT_TITLE_INFO: Record<TitleInfoKey, boolean> = {
  showBadges: true, showPhonetic: true, showWordRoot: true,
  showCollinsStars: true,
  showDomainCategory: true, showDomainRegion: true, showDomainUsage: true,
}
// 与 reviewService.REVIEW_DEFAULTS 保持同值，但刻意不复用：import service 会把数据库层
// 拖进本 store 的模块图。两侧不同步时以本处为准排查。
export const DEFAULT_REVIEW: ReviewSettings = {
  retention: 0.9, leechThreshold: 4, newCardQuota: 10, queueLimit: 30, letterHighlight: true, showDueBadge: true,
}

// 侧栏四视图默认全开（v0.6.5 §4.4）。只 import 常量、不 import 组件——store 不该拉进 React 树。
export const DEFAULT_SMART_VIEWS: Record<SmartViewKey, boolean> = {
  all: true, due: true, weekNew: true, leech: true,
}

/**
 * 存档迁移。抽成具名导出是为了可测，但**直接调用它验不出接线**：一个导出了却从没被
 * persist 引用的 migrate，测试照样全绿。真正把「migrate 挂进 persist」和「version 升到位」
 * 一起钉住的是走 `persist.rehydrate()` 的那条用例——只有那条能观察到 migrate 到底跑没跑。
 * 直接调用则负责钉住合并逻辑本身（缺键回默认、旧值被保留）。两条合起来才是一对。
 */
export function migrateSettings(persisted: unknown): SettingsStore {
  const state = (persisted ?? {}) as Partial<SettingsStore> & { displayFields?: Record<string, boolean>; dictionaries?: unknown }
  const fields: Record<string, boolean> = { ...DEFAULT_DISPLAY_FIELDS, ...(state.displayFields) }
  delete fields.etymology
  if (fields.synonyms === undefined) fields.synonyms = true
  const titleInfo: Record<TitleInfoKey, boolean> = { ...DEFAULT_TITLE_INFO, ...state.titleInfo }
  // v0.8.x 词典合并：dictionaries 键此后没有任何读取方（searchService 已不再读它），
  // 从合并结果里显式剔除，避免它作为一份谁都看不懂的残留长期留在 localStorage 里。
  // 升到 9 的真正理由与 v0.6.5 那次的措辞不同：这里不是「缺键要兜底」，而是
  // 「多键要删除」——而 zustand 的 merge 只会覆盖键，永远不会删键，所以必须靠 migrate。
  const { dictionaries: _dropped, ...rest } = state
  return {
    ...rest,
    displayFields: fields,
    titleInfo,
    review: { ...DEFAULT_REVIEW, ...state.review },
    smartViews: { ...DEFAULT_SMART_VIEWS, ...state.smartViews },
  } as SettingsStore
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      displayFields: DEFAULT_DISPLAY_FIELDS,
      sidebarMode: 'alphabet',
      titleInfo: DEFAULT_TITLE_INFO,
      review: DEFAULT_REVIEW,
      smartViews: DEFAULT_SMART_VIEWS,
      setDisplayField: (key, on) => set(s => ({ displayFields: { ...s.displayFields, [key]: on } })),
      setSidebarMode: (mode) => set({ sidebarMode: mode }),
      setTitleInfo: (key, on) => set(s => ({ titleInfo: { ...s.titleInfo, [key]: on } })),
      setReview: (key, value) => set(s => ({ review: { ...s.review, [key]: value } })),
      // 「完整词库」是视图未激活时的落点，强制为 true（§4.4「完整词库锁定不可关」）：
      // 关掉它就没有任何视图能表示「没有过滤」，WordList 的 activeView 回退会指向它。
      setSmartView: (key, on) => set(s => ({
        smartViews: { ...s.smartViews, [key]: key === LOCKED_SMART_VIEW ? true : on },
      })),
    }),
    {
      name: 'wordsett-settings',
      // v0.6.3：加 showDueBadge 后升到 7，让旧数据（v0.6.2 写盘为 6）触发一次 migrate 补上该字段。
      // migrate 里的 `review: { ...DEFAULT_REVIEW, ...state.review }` 本就兜住新字段缺省，
      // 但 zustand 仅在「存档 version ≠ 本处 version」时才调 migrate——不升版，
      // 存档里缺的那把键就只能按当前的（可能已被用户改过）值留着。
      // v0.6.5：加 smartViews → 8，同理。这一次的实际后果更隐蔽：残缺的 smartViews 存档
      // 合并进来时缺键保留旧值，用户关掉的视图会静默重新打开（细节见 migrateSettings 里的注释）。
      // v0.8.x：删 dictionaries → 9。理由与上两次相反：这次不是「缺键要兜底」而是「多键要删除」，
      // 而 zustand 的 merge 只会覆盖键、从不删键，所以必须靠 migrate 显式剔除。
      version: 9,
      storage: createJSONStorage(() => localStorage),
      migrate: migrateSettings,
      onRehydrateStorage: () => (_, error) => {
        if (error) {
          // 损坏/缺失数据 → 回退默认值
          useSettingsStore.setState({
            displayFields: DEFAULT_DISPLAY_FIELDS,
            sidebarMode: 'alphabet',
            titleInfo: DEFAULT_TITLE_INFO,
            review: DEFAULT_REVIEW,
            smartViews: DEFAULT_SMART_VIEWS,
          })
        }
      },
      partialize: (s) => ({
        displayFields: s.displayFields,
        sidebarMode: s.sidebarMode,
        titleInfo: s.titleInfo,
        review: s.review,
        smartViews: s.smartViews,
      }),
    }
  )
)
