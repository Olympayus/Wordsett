/** 版本号工具（v0.7.8）：只认 `a.b.c` / `a.b` 两种形状。
 *
 *  只用于比较「远端清单里的版本」与「本机 package.json 的版本」，不处理
 *  pre-release / build 后缀——远端清单写的是发布版本，本机也是。任何解析
 *  失败都返回 `null` 而不是猜一个默认值，让调用方能明确区分「没更新」与
 *  「不知道」。
 */

const VERSION_RE = /^\d+\.\d+(\.\d+)?$/

export function parseVersion(v: string): [number, number, number] | null {
  if (!VERSION_RE.test(v)) return null
  const [major, minor, patch] = v.split('.')
  return [Number(major), Number(minor), Number(patch ?? '0')]
}

/** 逐段比较。任一侧解析失败返回 `null`；否则 -1 / 0 / 1。 */
export function compareVersions(a: string, b: string): number | null {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return null
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1
  }
  return 0
}

/** `remote` 严格高于 `current` 才是新版本；解析失败一律 `false`。 */
export function isNewer(remote: string, current: string): boolean {
  return compareVersions(remote, current) === 1
}

/** 解析远端 `latest.json`，只取 `version`。
 *
 *  JSON 损坏、不是对象、缺 `version`、`version` 非字符串或不是合法版本号，
 *  一律 `null`——清单多了别的字段（notes / platforms 等）不影响读取。
 */
export function parseLatestManifest(text: string): { version: string } | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const version = (data as { version?: unknown }).version
  if (typeof version !== 'string' || parseVersion(version) === null) return null
  return { version }
}
