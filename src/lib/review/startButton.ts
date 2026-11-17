import type { FreeScopeKind, ReviewStrategy } from './types'
import { canStartFreeScope } from './categoryCounts'

/**
 * 自由练习的范围选择（v0.7.10 §7.7）。
 *
 * 从 `FreeScopePanel` 的内部 state 提升到 `ReviewModule` 顶层：左栏开始按钮（T21）与
 * 右栏范围面板必须读同一份状态，否则按钮的可用性与面板里看到的选择会各说各话。
 * `categoryIds` / `limit` 恒有值（面板编辑态总是完整的一份），与 store 里只描述
 * 「已开始会话」的 `FreeScope`（字段可选）刻意分开——后者不是编辑态的持久化。
 */
export interface FreeScopeSelection {
  kind: FreeScopeKind
  categoryIds: string[]
  limit: number
}

/** 左栏开始按钮的呈现态：隐藏 / 文案 / 置灰 / 置灰原因。 */
export interface StartButtonState {
  visible: boolean
  label: string
  disabled: boolean
  reason: string | null
}

/**
 * 左栏开始按钮的判据（v0.7.10 §7.7，用户裁定的「统一到左栏」）。
 *
 * 三态：
 * - 会话进行中 → 整块隐藏（不再给第二个入口）；
 * - 今日复习 → 「开始复习」，可出题为 0 时置灰并说明「今天没有待复习的词」；
 * - 自由练习 → 「开始练习」，词库为空或当前范围不可开始时置灰，原因按优先级给：
 *   词库为空优先于「至少勾选一个分类」——空库里勾分类是无意义的下一步。
 *
 * 抽成纯函数与 `canStartFreeScope` / `answerBarMode` 同一个理由：仓库没有组件测试 harness，
 * 只写在 JSX 里的判据钉不住；按钮文案与原因又恰恰是最容易在两三处实现间漂的东西。
 */
export function startButtonState(a: {
  strategy: ReviewStrategy
  live: boolean
  deliverable: number
  wordCount: number
  free: FreeScopeSelection
}): StartButtonState {
  if (a.live) return { visible: false, label: '', disabled: true, reason: null }

  if (a.strategy === 'today') {
    const disabled = a.deliverable <= 0
    return { visible: true, label: '开始复习', disabled, reason: disabled ? '今天没有待复习的词' : null }
  }

  const disabled = a.wordCount === 0 || !canStartFreeScope(a.free.kind, a.free.categoryIds)
  let reason: string | null = null
  if (disabled) {
    if (a.wordCount === 0) reason = '词库为空'
    else if (a.free.kind === 'category' && a.free.categoryIds.length === 0) reason = '至少勾选一个分类'
    else reason = '当前范围没有可练的词'
  }
  return { visible: true, label: '开始练习', disabled, reason }
}
