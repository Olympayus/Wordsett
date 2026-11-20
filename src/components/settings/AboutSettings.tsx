import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import pkg from '../../../package.json'
import { useUpdaterStore } from '../../stores/updaterStore'
import { useMobileUpdateStore } from '../../stores/mobileUpdateStore'
import { usePlatformClass } from '../../lib/usePlatform'
import { openExternalUrl, RELEASES_URL } from '../../lib/openExternal'
import { useMobilePopup } from '../../lib/mobilePopups'
import SquareButton from '../ui/SquareButton'
import type { ButtonTone } from '../ui/SquareButton'
import Tooltip from '../ui/Tooltip'
import Icon from '../icons'

/** 更新方式说明的「i」悬浮窗（v0.7.8 收尾）：原来那行常驻小字收进这里，
 *  图标紧跟在「检查更新」右侧，点开才占版面。
 *
 *  关窗三条路径与手机其它浮层一致：再点图标（开关）、点面板外（捕获阶段
 *  `pointerdown`，触摸端同样触发）、安卓返回键（`useMobilePopup` 登记）；
 *  另加 Esc 供键盘 / 桌面语义。 */
function UpdateHintPopover() {
  const [open, setOpen] = useState(false)
  const hostRef = useRef<HTMLSpanElement>(null)
  useMobilePopup(open, () => setOpen(false))
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e: PointerEvent) => {
      if (hostRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [open])
  return (
    <span ref={hostRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <Tooltip content="更新方式说明">
        <button
          type="button"
          aria-label="更新方式说明"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
          style={{
            width: 31, height: 31, padding: 0, flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid var(--color-hairline)', borderRadius: '50%',
            background: 'transparent', color: 'var(--color-text-secondary)',
            cursor: 'pointer', touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
          }}
        >
          <Icon name="info" size={15} />
        </button>
      </Tooltip>
      {open && (
        <div
          role="note"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 'var(--z-dropdown)',
            width: 'min(248px, calc(100vw - 136px))', padding: '10px 12px',
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-overlay)',
            fontSize: 'var(--text-xs)', lineHeight: 1.7, color: 'var(--color-text-primary)',
          }}
        >
          <div>手机版不支持应用内更新。新版本请在浏览器打开发布页，下载最新 APK 覆盖安装。</div>
          <div style={{
            marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
            color: 'var(--color-text-primary)', wordBreak: 'break-all', userSelect: 'text',
          }}>
            {RELEASES_URL}
          </div>
        </div>
      )}
    </span>
  )
}

/**
 * 「查看日志」浮层（v0.8.0 Task 1）：真机没有 DevTools，最近日志是排查问题的唯一入口。
 *
 * 形态沿用 `ConfirmDialog` 的自绘浮层（`position: fixed` + `role="dialog"` + 遮罩），
 * 不引入新原语；关闭三条路径与站内其它浮层一致：点遮罩、Esc、安卓返回键
 * （`useMobilePopup` 登记，手势返回同样走它）。
 *
 * 内容来自 `read_recent_logs`（Rust 侧读 `wordsett.log` 尾部 400 行），
 * `pre` 保留换行且允许选中复制；「复制」失败静默——剪贴板权限在 WebView 里可能不可用，
 * 弹提示反而盖住日志本身。
 */
function LogViewer({ tone }: { tone: ButtonTone }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  useMobilePopup(open, () => setOpen(false))

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError(null)
    invoke<string>('read_recent_logs', { maxLines: 400 })
      .then(t => { if (!cancelled) setText(t) })
      .catch(e => { if (!cancelled) setError(String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const copy = () => {
    try {
      void navigator.clipboard.writeText(text).catch(() => {})
    } catch {
      // 剪贴板不可用（无权限 / 非安全上下文）时静默，日志本身仍可手动选中复制。
    }
  }

  return (
    <>
      <SquareButton tone={tone} onClick={() => setOpen(true)}>
        查看日志
      </SquareButton>
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 'var(--z-modal)',
            background: 'var(--color-scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="最近日志"
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(560px, 100%)', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
              background: 'var(--color-surface)', borderRadius: 10,
              boxShadow: 'var(--shadow-overlay)', padding: 18, fontFamily: 'var(--font-sans)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>最近日志</div>
              <SquareButton tone="surface" size="row" onClick={() => setOpen(false)}>关闭</SquareButton>
            </div>
            <pre
              style={{
                whiteSpace: 'pre-wrap', userSelect: 'text',
                flex: '1 1 auto', minHeight: 0, overflow: 'auto', margin: 0,
                padding: '10px 12px', background: 'var(--color-canvas)',
                border: '1px solid var(--color-border)', borderRadius: 6,
                fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6,
                color: 'var(--color-text-primary)',
              }}
            >
              {loading ? '读取中…' : error !== null ? `读取失败：${error}` : text || '暂无日志'}
            </pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <SquareButton tone="surface" onClick={copy} disabled={loading || error !== null || !text}>
                复制
              </SquareButton>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

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
          <UpdateHintPopover />
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
          {/* 真机诊断通道（v0.8.0 Task 1）：手机 / 平板都能把最近日志读出来。 */}
          <LogViewer tone={tone} />
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
