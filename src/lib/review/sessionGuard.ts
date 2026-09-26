import type { ReviewStrategy } from './types'

/**
 * 会话守卫（v0.6.2 §5.2，取代 v0.6 spec §2.4）。
 *
 * 答题进行中，点击做题区之外的任何可点元素都要弹确认窗；确认才离开并结束本轮。
 *
 * 为什么用「window 捕获阶段 + 元素标记」而不是给每个 handler 加守卫：
 * 后者要求每个导航入口都记得调用守卫，将来新加的按钮会静默漏网——而漏网的后果是
 * 一轮答题在用户没察觉的情况下被丢掉。标记放在**被点元素本身**还有第二个作用：
 * 捕获阶段拦下点击后原始 handler 不会执行，重放必须能从元素读出「原本要做什么」。
 */

/**
 * 最小结构：真实 DOM 元素天然满足，测试可用纯对象代替。
 *
 * `contains` 的参数写作 `unknown`（而不是 GuardTarget）是因为方法参数按双变比较：
 * lib.dom 的 `contains(other: Node | null)` 与 `contains(other: unknown)` 互相可赋值，
 * 而若把参数写成 GuardTarget，真 Element 反而会因为 `Node` 参数不兼容而赋不进来。
 * `closest` / `getAttribute` 不受影响，保持与 lib.dom 同签名。
 */
export interface GuardTarget {
  closest(selector: string): GuardTarget | null
  getAttribute(name: string): string | null
  contains(other: unknown): boolean
}

/** 区外可点元素上的意图标记。值形如 `module:settings` / `strategy:free`。 */
export const GUARD_ATTR = 'data-session-guard'

/** 做题区容器的标记。落在它内部的点击一律放行。 */
export const ARENA_ATTR = 'data-arena-region'

const MODULES = new Set(['workbench', 'review', 'settings'])
const STRATEGIES = new Set<ReviewStrategy>(['today', 'free'])

export type GuardIntent =
  | { kind: 'module'; value: string }
  | { kind: 'strategy'; value: ReviewStrategy }

/**
 * 从被点元素（或其任一祖先）读出意图。没有标记、或值不合法时返回 null——
 * 拼错的标记不该被当成命令执行。
 */
export function parseIntent(target: GuardTarget | null): GuardIntent | null {
  if (!target) return null
  const holder = target.closest(`[${GUARD_ATTR}]`)
  if (!holder) return null
  const raw = holder.getAttribute(GUARD_ATTR) ?? ''
  const sep = raw.indexOf(':')
  if (sep <= 0) return null
  const kind = raw.slice(0, sep)
  const value = raw.slice(sep + 1)
  if (kind === 'module' && MODULES.has(value)) return { kind: 'module', value }
  if (kind === 'strategy' && STRATEGIES.has(value as ReviewStrategy)) {
    return { kind: 'strategy', value: value as ReviewStrategy }
  }
  return null
}

/**
 * 这次点击是否落在做题区内。
 * arena 为 null（容器未挂载）时一律返回 false——宁可拦错，也不要静默放行把一轮答题丢掉。
 */
export function clickStaysInArena(target: GuardTarget | null, arena: GuardTarget | null): boolean {
  if (!target || !arena) return false
  return arena.contains(target)
}

/** 离开确认窗的文案。与「结束回合」同源，只是标题与确认按钮改写以区分两条路径。 */
export function leaveMessage(answered: number, remaining: number): {
  title: string
  message: string
  confirmLabel: string
} {
  return {
    title: '结束本轮答题？',
    message: `已答的 ${answered} 道题照常保存，但本轮不会生成小结，剩余 ${Math.max(0, remaining)} 题留到下次。`,
    confirmLabel: '结束并离开',
  }
}

/** 一次点击该怎么处置。 */
export type GuardDecision =
  /** 放行：不拦截，也不改任何状态 */
  | 'allow'
  /** 忽略：不弹窗，但也不拦截（区外无意图的点击） */
  | 'ignore'
  /** 弹确认窗：确认才结束本轮并重放意图 */
  | 'confirm'

/**
 * 把守卫的判定抽成纯函数（v0.6.2 §5.2）。
 *
 * 抽出来的理由是**可测**：`cancel（不结束本轮）` 这条行为只有组件才能执行，
 * 而本仓库没有组件测试 harness，所以「取消后状态不变」无法直接断言。
 * 能断言的是它的前置：判定为 `allow` / `ignore` 时组件压根不会走到 `reset()` 那一步。
 * 于是「该惰性的时候必须惰性」这件最关键的事被钉住了。
 */
export function decisionFor(
  live: boolean,
  inArena: boolean,
  intent: GuardIntent | null,
): GuardDecision {
  if (!live) return 'allow'      // 没有会话进行 —— 守卫彻底惰性
  if (inArena) return 'allow'    // 做题区内 —— 放行
  if (!intent) return 'ignore'   // 区外但无意图 —— 不烦人
  return 'confirm'
}
