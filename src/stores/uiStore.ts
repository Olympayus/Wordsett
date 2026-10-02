import { create } from 'zustand'
import type { Category } from '../types/category'

export interface EditorTarget { category: Category | null; wordId: string | null }

export interface ConfirmRequest {
  title: string
  message: string
  danger?: boolean
  confirmLabel?: string
  /** 次按钮的文案。缺省仍是「取消」。v0.7.0 的关窗弹窗两个按钮都是肯定动作，
   *  需要能分别命名（「直接退出」/「最小化到托盘」）。 */
  cancelLabel?: string
  /** 点遮罩是否等同于点次按钮。**缺省 true**，既有调用点行为不变。
   *  关窗弹窗必须传 false：那里 `resolveConfirm(false)` 等于「直接退出应用」，
   *  误点遮罩就把应用关了。 */
  dismissable?: boolean
  alertMode?: boolean
}

interface UiStore {
  assignWordId: string | null
  editorTarget: EditorTarget | null
  confirmReq: ConfirmRequest | null
  openAssign: (wordId: string) => void
  openEditor: (category: Category | null, wordId: string | null) => void
  closeModals: () => void
  confirm: (req: ConfirmRequest) => Promise<boolean>
  resolveConfirm: (ok: boolean) => void
}

let confirmResolver: ((ok: boolean) => void) | null = null

export const useUiStore = create<UiStore>((set) => ({
  assignWordId: null,
  editorTarget: null,
  confirmReq: null,
  openAssign: (wordId) => set({ assignWordId: wordId, editorTarget: null }),
  openEditor: (category, wordId) => set({ editorTarget: { category, wordId }, assignWordId: null }),
  closeModals: () => set({ assignWordId: null, editorTarget: null }),
  confirm: (req) => {
    set({ confirmReq: req })
    return new Promise<boolean>((resolve) => { confirmResolver = resolve })
  },
  resolveConfirm: (ok) => {
    confirmResolver?.(ok)
    confirmResolver = null
    set({ confirmReq: null })
  },
}))
