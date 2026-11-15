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
    // 单 resolver 只能记住最后一个：覆盖前先把旧确认框按「取消」结算掉（v0.7.8 Task 7 修复）。
    // 否则旧 Promise 永久挂起——编辑确认框打开时系统级关窗（Alt+F4 / 任务栏关闭）会走到这里，
    // 编辑确认的 Promise 被覆盖后永不 settle，`editGuard` 的 `inflight` 随之卡死，
    // 之后的关窗流程与所有入口守卫都会静默挂起。关掉旧弹窗视为取消，与 SessionGuard 的
    // swallow 先例一致（旧确认框已经不可见，不能再假装它还能被回答）。
    const previous = confirmResolver
    if (previous) {
      confirmResolver = null
      previous(false)
    }
    set({ confirmReq: req })
    return new Promise<boolean>((resolve) => { confirmResolver = resolve })
  },
  resolveConfirm: (ok) => {
    confirmResolver?.(ok)
    confirmResolver = null
    set({ confirmReq: null })
  },
}))
