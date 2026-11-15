import pkg from '../../package.json'
import { compareVersions, parseLatestManifest } from '../lib/version'

/** 手机端的更新检查不经过 Tauri updater（Android 安装包不走签名更新器），
 *  直接读仓库 main 分支上的发布清单；桌面仍走 `services/updater.ts`。 */
export const MOBILE_LATEST_URL = 'https://raw.githubusercontent.com/Olympayus/Wordsett/main/latest.json'

const TIMEOUT_MS = 15000

export type MobileUpdateResult =
  | { status: 'available'; version: string }
  | { status: 'latest' }
  | { status: 'error'; message: string }

export async function checkMobileUpdate(fetcher: typeof fetch = fetch): Promise<MobileUpdateResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetcher(MOBILE_LATEST_URL, { signal: controller.signal })
    if (!res.ok) return { status: 'error', message: `更新检查失败：HTTP ${res.status}` }
    const manifest = parseLatestManifest(await res.text())
    if (!manifest) return { status: 'error', message: '更新清单格式无效' }
    // 远端版本已由 parseLatestManifest 校验过，这里剩下的 null 只可能来自
    // 本机 package.json 的 version 被写坏。按规格 §6.2，不可比较算检查失败，
    // 绝不能落到 latest——否则所有用户都会看到「已是最新」。
    const cmp = compareVersions(manifest.version, pkg.version)
    if (cmp === null) return { status: 'error', message: '本机版本号无法解析' }
    return cmp === 1 ? { status: 'available', version: manifest.version } : { status: 'latest' }
  } catch (e) {
    const message = controller.signal.aborted
      ? '更新检查超时，请检查网络连接'
      : e instanceof Error ? e.message : String(e)
    return { status: 'error', message }
  } finally {
    clearTimeout(timer)
  }
}
