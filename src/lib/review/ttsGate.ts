/**
 * 听辨题型的运行时开关与诊断信息。
 *
 * 听辨依赖系统级 TTS，而「系统里有没有英文音色」只能是启动时探测出来的异步事实
 * （spec §5.3）。探测返回前一律视为不可用——放行的代价是用户抽到一张播放无声的
 * 听辨卡，而那张卡唯一的出路是「跳过」，会往计分事务里写一个 rating = 1。
 *
 * 之所以把门控做成模块级变量而不是每次现查：usableTemplates 是纯函数，靠参数拿门控值
 * （见 template.ts），数据层的每个调用点都从本模块读同一个事实。
 *
 * v0.6.2 起额外保存整份探测结果（`VoiceProbe`），因为设置页要显示「探测到了什么、
 * 卡在哪一步」（spec §6.4）。结果来自异步的 Tauri 命令，而设置页可能在结果落地**之前**
 * 就已挂载，故这里带一个最小的订阅机制供 `useSyncExternalStore` 使用——
 * 若只存变量，设置页会一直显示挂载那一刻的空结果。
 */

/** 探测结果。字段名与 Rust 侧 VoiceProbe 的 camelCase 线上格式一致（见 tts_player.rs）。 */
export interface VoiceProbe {
  available: boolean
  /** `"winrt"` / `"sapi"` / `"native"`（非 Windows）；不可用时为 null */
  backend: string | null
  voice: string | null
  reason: string | null
}

let probe: VoiceProbe | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const fn of listeners) {
    // 一个订阅者抛错不该拦住其余订阅者。React 的 useSyncExternalStore 订阅回调
    // 理论上不抛，但设置页之外将来可能有人挂别的副作用。
    try { fn() } catch { /* 忽略单个订阅者的异常 */ }
  }
}

export function isListenEnabled(): boolean {
  return probe?.available === true
}

export function getProbe(): VoiceProbe | null {
  return probe
}

export function setProbe(next: VoiceProbe | null): void {
  probe = next
  emit()
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** 仅供测试：把开关复位到「未探测」状态。 */
export function resetListenEnabled(): void {
  probe = null
  emit()
}
