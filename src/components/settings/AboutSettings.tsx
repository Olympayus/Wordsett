import pkg from '../../../package.json'
import { useUpdaterStore } from '../../stores/updaterStore'
import { useMobileUpdateStore } from '../../stores/mobileUpdateStore'
import { usePlatformClass } from '../../lib/usePlatform'
import { openExternalUrl, RELEASES_URL } from '../../lib/openExternal'
import SquareButton from '../ui/SquareButton'

/**
 * 「关于」里的版本行。
 *
 * 平台判据由 `usePlatformClass()` 承担（v0.7.8）：**非桌面一律渲染 Android 轻量 UI**，
 * 因为平板复用桌面外壳、调用点拿不到 `variant="mobile"`，却同样没有签名更新器。
 * `variant` 只为兼容既有调用点而保留，不再参与判定。
 *
 * Android 分支（spec §6）：签名更新器在 Android 上不可用（`updater_os()` 返回 `None`），
 * 故这里改为读 GitHub 上的 `latest.json` 检测版本（`useMobileUpdateStore`），只通知、
 * 不下载、不安装；用户要更新就把系统浏览器送到 Releases 页手动下载 APK。
 *
 * 桌面分支保持原样：`检查更新` 仍走 `useUpdaterStore.checkManually`。
 */
interface Props {
  /** @deprecated 平台判定已改由 `usePlatformClass()` 承担，此参数被忽略；保留以兼容调用点。 */
  variant?: 'desktop' | 'mobile'
}

export default function AboutSettings(_props: Props = {}) {
  const platform = usePlatformClass()

  const checkManually = useUpdaterStore(s => s.checkManually)
  const checking = useUpdaterStore(s => s.phase === 'checking')

  // 手机 / 平板共用的更新状态。状态行**只看 `phase`**：检查失败时 `hasUpdateBadge`
  // 可能仍保留着上一次的旧徽标（与桌面 updaterStore 一致），拿它反推成功与否会把
  // 一次失败渲染成「已是最新」。
  const mobilePhase = useMobileUpdateStore(s => s.phase)
  const mobileVersion = useMobileUpdateStore(s => s.version)
  const mobileError = useMobileUpdateStore(s => s.errorMessage)
  const mobileCheckManually = useMobileUpdateStore(s => s.checkManually)

  if (platform !== 'desktop') {
    const statusText = mobilePhase === 'idle'
      ? '点「检查更新」查看是否有新版本'
      : mobilePhase === 'checking'
        ? '正在检查…'
        : mobilePhase === 'latest'
          ? '已是最新版本'
          : mobilePhase === 'available'
            ? `发现新版本 v${mobileVersion ?? ''}`
            : `检查失败：${mobileError ?? ''}`
    const checkingNow = mobilePhase === 'checking'
    // 按钮底色按**直接父级**选（SquareButton 的既有约定）：手机设置页内容区是 canvas，
    // 平板复用桌面设置页的白底内容列（surface）。
    const tone = platform === 'android-phone' ? 'canvas' : 'surface'

    const openReleases = () => {
      void openExternalUrl(RELEASES_URL).catch(e => console.error('[mobile] 打开下载页失败：', e))
    }

    return (
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
        <div style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)' }}>Wordsett</div>
        <div style={{ color: 'var(--color-text-primary)', marginTop: 4 }}>版本：v{pkg.version}</div>
        <div style={{ marginTop: 8 }}>{statusText}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          <SquareButton tone={tone} onClick={() => { void mobileCheckManually() }} disabled={checkingNow}>
            检查更新
          </SquareButton>
          {mobilePhase === 'available' && (
            <SquareButton tone={tone} onClick={openReleases}>
              前往 GitHub 下载
            </SquareButton>
          )}
          {mobilePhase === 'error' && (
            <SquareButton tone={tone} onClick={() => { void mobileCheckManually() }}>
              重试
            </SquareButton>
          )}
        </div>
        <div style={{ marginTop: 8 }}>
          手机版不支持应用内更新。新版本请在浏览器打开发布页，下载最新 APK 覆盖安装。
        </div>
        <div style={{
          marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
          color: 'var(--color-text-primary)', wordBreak: 'break-all', userSelect: 'text',
        }}>
          {RELEASES_URL}
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
      <div style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)' }}>Wordsett</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: 'var(--color-text-primary)' }}>版本：v{pkg.version}</span>
        {/* 检查中走 SquareButton 自带的灰底 + 0.55 不透明度 + default 光标（v0.5.3 §4.1 第 16 条的统一样式），
            原来的手写透明底 + 描边 + 三级灰字一并去掉。 */}
        <SquareButton tone="surface" onClick={() => { void checkManually() }} disabled={checking}>
          检查更新
        </SquareButton>
      </div>
    </div>
  )
}
