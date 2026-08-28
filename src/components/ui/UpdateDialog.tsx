import { useUpdaterStore } from '../../stores/updaterStore'
import Icon from '../icons'

const btnPrimary = {
  padding: '6px 14px', border: 'none', borderRadius: 6, background: 'var(--color-brand)',
  color: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)',
}
const btnSecondary = {
  padding: '6px 14px', border: '1px solid var(--color-border)', borderRadius: 6, background: 'transparent',
  color: 'var(--color-text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)',
}

const mb = (n: number | undefined) => (n === undefined ? '' : `${(n / 1048576).toFixed(1)} MB`)

export default function UpdateDialog() {
  const s = useUpdaterStore()
  if (!s.open) return null
  const { phase, version, notes, errorMessage, errorHint, percent, downloadedBytes, contentLength, stalled } = s
  const { closeDialog, checkManually, startDownload, cancelDownload } = s

  const pct = percent === null ? null : Math.round(percent * 100)
  const title =
    phase === 'checking' ? '正在检查更新…'
    : phase === 'latest' ? '已是最新版本'
    : phase === 'available' ? `发现新版本 v${version}`
    : phase === 'downloading' ? '正在下载更新…'
    : phase === 'installing' ? '正在安装更新…'
    : phase === 'done' ? '更新完成'
    : phase === 'error' ? '更新失败'
    : ''

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-modal)', background: 'var(--color-scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={closeDialog}
    >
      <div style={{ width: 360, maxWidth: '90vw', background: 'var(--color-surface)', borderRadius: 10, boxShadow: 'var(--shadow-overlay)', overflow: 'hidden', fontFamily: 'var(--font-sans)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 0' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: phase === 'error' ? 'var(--color-danger)' : 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {phase === 'checking' && <span style={{ width: 14, height: 14, border: '2px solid var(--color-border-strong)', borderTopColor: 'var(--color-brand)', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />}
            {title}
          </div>
          <button type="button" onClick={closeDialog} aria-label="关闭"
            style={{ width: 24, height: 24, border: 'none', background: 'transparent', borderRadius: 4, color: 'var(--color-text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" size={14} />
          </button>
        </div>

        <div style={{ padding: '12px 18px 16px' }}>
          {phase === 'checking' && <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>正在联系更新服务器，请稍候</div>}

          {phase === 'latest' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--color-text-secondary)' }}>
              <span style={{ color: 'var(--color-success)' }}>✓</span> 当前已是最新版本
            </div>
          )}

          {phase === 'available' && (
            <>
              <div style={{ background: 'var(--color-surface-sunken)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.6, maxHeight: 80, overflow: 'hidden', whiteSpace: 'pre-wrap' }}>
                {notes || '本次更新包含功能改进与修复。'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 8 }}>更新将下载并安装，安装完成后自动重启应用</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button type="button" style={btnSecondary} onClick={closeDialog}>稍后</button>
                <button type="button" style={btnPrimary} onClick={() => void startDownload()}>立即更新</button>
              </div>
            </>
          )}

          {phase === 'downloading' && (
            <>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--color-surface-sunken)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct ?? 0}%`, background: 'var(--color-brand)', borderRadius: 3, transition: 'width 150ms var(--ease-smooth)' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                <span>{pct === null ? '下载中…' : `${pct}%`}</span>
                <span>{mb(downloadedBytes)}{contentLength ? ` / ${mb(contentLength)}` : ''}</span>
              </div>
              {stalled && <div style={{ fontSize: 12, color: 'var(--color-accent)', marginTop: 6 }}>下载无响应，可能是网络过慢或代理未放行下载域名</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" style={btnSecondary} onClick={() => void cancelDownload()}>取消</button>
              </div>
            </>
          )}

          {phase === 'installing' && (
            <>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--color-surface-sunken)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: '100%', background: 'var(--color-brand)', borderRadius: 3, opacity: 0.5, animation: 'weave-pulse 1.2s ease-in-out infinite' }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginTop: 6 }}>安装完成后将自动重启 Wordsett</div>
            </>
          )}

          {phase === 'done' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" style={btnSecondary} onClick={closeDialog}>关闭</button>
            </div>
          )}

          {phase === 'error' && (
            <>
              <div style={{ background: 'color-mix(in srgb, var(--color-danger) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-danger) 25%, transparent)', borderRadius: 6, padding: '8px 10px', fontSize: 12, color: 'var(--color-danger)', lineHeight: 1.6, wordBreak: 'break-all' }}>
                {errorMessage}
              </div>
              {errorHint && <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6, lineHeight: 1.6 }}>{errorHint}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button type="button" style={btnSecondary} onClick={closeDialog}>关闭</button>
                <button type="button" style={btnPrimary} onClick={() => void checkManually()}>重试</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
