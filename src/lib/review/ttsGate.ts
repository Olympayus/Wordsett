/**
 * 听辨题型的运行时开关。
 *
 * 听辨依赖系统级 TTS，而「系统里有没有英文音色」只能是启动时探测出来的异步事实
 * （spec §5.3）。探测返回前一律视为不可用——放行的代价是用户抽到一张播放无声的
 * 听辨卡，而那张卡唯一的出路是「跳过」，会往计分事务里写一个 rating = 1。
 *
 * 之所以做成模块级变量而不是每次现查：usableTemplates 是纯函数，靠参数拿门控值
 * （见 template.ts），数据层的每个调用点都从本模块读同一个事实。
 */
let listenEnabled = false

export function isListenEnabled(): boolean {
  return listenEnabled
}

export function setListenEnabled(on: boolean): void {
  listenEnabled = on
}

/** 仅供测试：把开关复位到「未探测」状态。 */
export function resetListenEnabled(): void {
  listenEnabled = false
}
