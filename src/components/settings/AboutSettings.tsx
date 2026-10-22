import pkg from '../../../package.json'
import { useUpdaterStore } from '../../stores/updaterStore'
import SquareButton from '../ui/SquareButton'

/**
 * 「关于」里的版本行。
 *
 * `variant="mobile"`（Android，spec §9）：签名更新器在 Android 上不可用（`updater_os()` 返回
 * `None`），故**不渲染「检查更新」**——那个按钮在手机上必然失败，而失败状态唯一的宿主
 * `UpdateDialog` 又刻意不挂，用户只会看到「点了没反应」。取而代之的是 spec §6 要求的
 * 「手动安装说明」：版本号 + 去 GitHub Releases 下载 APK 的文字指引。
 *
 * 本版不做「检查最新版本」的网络请求：仓库没有 http 插件，且这条路径在真机上无从验证；
 * 记在 SDD 账本里留待 Plan 4。
 */
interface Props {
  variant?: 'desktop' | 'mobile'
}

const RELEASES_URL = 'https://github.com/Olympayus/Wordsett/releases'

export default function AboutSettings({ variant = 'desktop' }: Props) {
  const checkManually = useUpdaterStore(s => s.checkManually)
  const checking = useUpdaterStore(s => s.phase === 'checking')

  if (variant === 'mobile') {
    return (
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
        <div style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)' }}>Wordsett</div>
        <div style={{ color: 'var(--color-text-primary)', marginTop: 4 }}>版本：v{pkg.version}</div>
        <div style={{ marginTop: 8 }}>
          手机版不支持应用内更新。新版本请在浏览器打开发布页，下载最新 APK 覆盖安装。
        </div>
        {/* 纯文本而不是链接：仓库没有引入 opener 的 JS 侧包，`window.open` 在 WebView 里
            的行为未在真机上验证过。可长按选中复制。 */}
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
