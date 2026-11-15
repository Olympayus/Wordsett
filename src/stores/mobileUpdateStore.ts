import { create } from 'zustand'
import { checkMobileUpdate, type MobileUpdateResult } from '../services/mobileUpdate'

export type MobileUpdatePhase = 'idle' | 'checking' | 'latest' | 'available' | 'error'

interface MobileUpdateStore {
  phase: MobileUpdatePhase
  version: string | null
  errorMessage: string | null
  hasUpdateBadge: boolean
  badgeVersion: string | null
  checkSilently: () => Promise<void>
  checkManually: () => Promise<void>
}

/** 模块级单飞令牌：`checkSilently` 与 `checkManually` 共用同一次请求，
 *  并发触发（例如启动时静默检查尚未返回、用户又点了「检查更新」）不会
 *  打两遍网络。请求结束即清空，下一次检查重新发起。 */
let inFlight: Promise<MobileUpdateResult> | null = null

const request = (): Promise<MobileUpdateResult> => {
  if (!inFlight) {
    inFlight = checkMobileUpdate().finally(() => { inFlight = null })
  }
  return inFlight
}

export const useMobileUpdateStore = create<MobileUpdateStore>((set) => ({
  phase: 'idle',
  version: null,
  errorMessage: null,
  hasUpdateBadge: false,
  badgeVersion: null,

  // 静默检查只在新版本时落状态：latest / error 都保持原状，
  // 免得后台的一次网络失败把界面上已有的结果抹掉。
  checkSilently: async () => {
    const r = await request()
    if (r.status === 'available') {
      set({ phase: 'available', version: r.version, hasUpdateBadge: true, badgeVersion: r.version, errorMessage: null })
    }
  },

  // 手动检查如实反映结果：checking → available / latest / error。
  checkManually: async () => {
    set({ phase: 'checking', errorMessage: null })
    const r = await request()
    if (r.status === 'available') {
      set({ phase: 'available', version: r.version, hasUpdateBadge: true, badgeVersion: r.version, errorMessage: null })
    } else if (r.status === 'latest') {
      set({ phase: 'latest', version: null, hasUpdateBadge: false, badgeVersion: null, errorMessage: null })
    } else {
      set({ phase: 'error', errorMessage: r.message })
    }
  },
}))
