type Invoker = (cmd: string, args: Record<string, unknown>) => Promise<unknown>

/**
 * 播放一个词的发音（v0.6.3 条目 12）。
 *
 * **不接听辨题的音色探针门控**（lib/review/ttsGate）：那个门控管的是「听辨题能不能出」——
 * 系统里有没有英文音色决定的是出不出题，与用户主动点发音无关。点了没声就是系统没装英文音色，
 * 按 PromptCard 里听辨按钮的既有做法**静默降级**：不弹错、不留未捕获拒绝、也不写 console。
 * 写 console 会让每次点击都刷一条，「没装音色」是稳定的环境事实、不是故障。
 *
 * invoke 走参数注入（默认动态 import @tauri-apps/api/core）：本模块因此可以在 Node 下直接测，
 * 不需要 Tauri 运行时，也不需要 mock 掉整个模块注册表。
 */
export async function speakWord(text: string, invoke?: Invoker): Promise<void> {
  if (!text) return
  try {
    const fn = invoke ?? (await import('@tauri-apps/api/core')).invoke
    // 不传 rate / voice：由 Rust 侧取 shortcuts.json 的当前值（v0.7.0）。
    // 调用方因此不必知道用户选了什么音色、语速是多少。
    await fn('speak', { text })
  } catch {
    /* 静默降级：系统没有英文音色时就是这样 */
  }
}
