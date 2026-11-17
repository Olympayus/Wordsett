import type { PlatformClass } from './platform'

/**
 * 听辨题型不可用时，移动端要显示的安装指引（v0.7.10）。
 *
 * 桌面那两条（Windows 的「语言选项 → 下载语音包」与 macOS 的「管理声音」）是
 * 桌面系统设置里的路径，Android 上不存在；移动端统一走系统「文字转语音」入口。
 * 纯函数只回答「移动端该给哪一句」——桌面返回 `null`，因为 Windows / macOS 的
 * 文案各不相同、由组件按既有分支逐字渲染，不把运行系统判断搬进来。
 */
export function ttsInstallHint(p: PlatformClass): string | null {
  return p === 'desktop' ? null : '系统设置 › 文字转语音（TTS）→ 安装或选择英文语音'
}
