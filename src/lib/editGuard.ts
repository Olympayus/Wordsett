import { useUiStore } from '../stores/uiStore'

/** 正在编辑的工作区注册进来的守卫；同一时刻只允许一个（单例）。 */
export interface EditGuard {
  isDirty: () => boolean
  discard: () => void
  cancelSilently: () => void
}

/** 未保存确认的固定文案（设计稿 §5.2）。 */
const CONFIRM_REQUEST = {
  title: '有未保存的修改',
  message: '离开后这次编辑会丢失。',
  confirmLabel: '放弃修改',
  cancelLabel: '继续编辑',
  danger: true,
} as const

let guard: EditGuard | null = null
/** 已经在本次编辑里确认过「放弃修改」，后续导航不再重复弹窗。 */
let discarded = false
/** in-flight 的确认 Promise；同一时刻最多一个确认框。 */
let inflight: Promise<boolean> | null = null

/**
 * 注册编辑守卫，返回注销函数。注册时重置 `discarded`——新一次编辑重新计脏。
 * 注销只在自己仍是当前守卫时生效，避免旧组件的 cleanup 摘掉新守卫。
 */
export function registerEditGuard(next: EditGuard): () => void {
  guard = next
  discarded = false
  return () => {
    if (guard === next) guard = null
  }
}

/** 当前是否需要先确认再离开：有守卫、没确认过放弃、且真的有改动。 */
export function needsConfirmEditLeave(): boolean {
  return !!guard && !discarded && guard.isDirty()
}

/**
 * 离开编辑态的统一入口：无守卫 / 已干净 → 放行；dirty → 走 `useUiStore.confirm`。
 * 确认「放弃修改」后置 `discarded` 并调 `discard()`（乐观清脏），返回 true；
 * 「继续编辑」返回 false。in-flight 期间重复调用复用同一个 Promise。
 */
export function confirmLeaveEdit(): Promise<boolean> {
  if (!guard) return Promise.resolve(true)
  if (inflight) return inflight
  if (discarded || !guard.isDirty()) {
    guard.cancelSilently()
    return Promise.resolve(true)
  }
  // 已有别的确认框打开：不覆盖它（store 只有一个 resolver），也不放行。
  if (useUiStore.getState().confirmReq) return Promise.resolve(false)

  const active = guard
  const pending = useUiStore.getState().confirm({ ...CONFIRM_REQUEST }).then((ok) => {
    inflight = null
    if (ok) {
      discarded = true
      active.discard()
    }
    return ok
  })
  inflight = pending
  return pending
}

/**
 * 应用窗口失焦：dirty → 弹确认；未改动 → 静默退出编辑；无守卫 → 什么也不做。
 * 确认框已打开时由 `confirmLeaveEdit` 的 in-flight 去重兜住，不重复触发。
 */
export function handleAppBlur(): void {
  if (!guard) return
  if (needsConfirmEditLeave()) {
    void confirmLeaveEdit()
  } else {
    guard.cancelSilently()
  }
}

/**
 * 包住一个可能改变导航 / 模块状态的 action：干净时同步执行并返回结果；
 * dirty 时先确认，确认「放弃修改」才执行，否则整条链中止（返回 undefined）。
 */
export function withEditGuard<T>(action: () => T): T | Promise<T> | undefined {
  if (!needsConfirmEditLeave()) return action()
  // 取消时实际 resolve undefined；对外签名按设计稿固定为 `T | Promise<T> | undefined`。
  return confirmLeaveEdit().then((ok) => (ok ? action() : undefined)) as Promise<T>
}

/** 捕获阶段的点击拦截判据：确认框自己、编辑输入框、保存 / 取消白名单都不拦。 */
export function shouldInterceptEditClick(input: {
  dirty: boolean
  confirmOpen: boolean
  inEditor: boolean
  keep: boolean
}): boolean {
  return input.dirty && !input.confirmOpen && !input.inEditor && !input.keep
}

/** 只清本模块状态，供测试使用（不碰 store）。 */
export function resetEditGuardForTests(): void {
  guard = null
  discarded = false
  inflight = null
}
