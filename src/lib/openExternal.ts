import { invoke } from '@tauri-apps/api/core'

/**
 * 仓库的 GitHub Releases 最新版页面（v0.7.8 手机 / 平板更新）。
 *
 * 手机版不走签名更新器，也没有应用内下载：发现新版本后只能把用户送到这个页面手动下载 APK。
 * About 与 TopBar 共用同一个地址，避免两处各写一份、改一处漏一处。
 */
export const RELEASES_URL = 'https://github.com/Olympayus/Wordsett/releases/latest'

/**
 * 用系统浏览器打开外部链接。
 *
 * Rust 侧的 `open_external_url` 只放行 `https://github.com/` 前缀，其它地址返回
 * `Err("仅允许打开 GitHub 链接")`；本函数不再做第二份校验（判定只留一处），
 * 失败原样抛给调用方，由它决定是否只记日志。
 */
export async function openExternalUrl(url: string): Promise<void> {
  await invoke('open_external_url', { url })
}
