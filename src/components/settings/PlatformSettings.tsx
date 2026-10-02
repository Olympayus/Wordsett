import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface PlatformStatus { supported: boolean; granted: boolean }

/**
 * 平台权限（v0.7.0 §4.6）。**仅 macOS 渲染**：
 * Windows 上 `supported === false`，整段返回 null——与 03 §2.5「Windows 无此分区」一致，
 * 所以这个组件不会在 Windows 设置页留下一个空分区。
 *
 * 这个权限唯一服务的是 v0.8.0 划-3 的模拟复制抓词（向其他应用发送合成键盘事件）。
 * 没授权时的表现是「热键按得下、但抓词没反应且不报错」，故必须把状态显示出来。
 */
export default function PlatformSettings() {
  const [status, setStatus] = useState<PlatformStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { void invoke<PlatformStatus>('accessibility_status').then(setStatus) }, [])
  if (!status || !status.supported) return null

  const open = async () => {
    setError(null)
    try {
      await invoke('open_accessibility_settings')
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <>
      <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-primary)', margin: '28px 0 6px' }}>
        平台权限
      </div>
      <div style={{
        border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
        background: 'var(--color-surface-raised)', padding: '10px 12px', fontSize: '12px', lineHeight: 1.8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)' }}>辅助功能授权</span>
          <span style={{ color: status.granted ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}>
            {status.granted ? '● 已授权' : '○ 未授权'}
          </span>
        </div>
        {!status.granted && (
          <div style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
            划词抓词需要此权限；授权后需重启应用。
          </div>
        )}
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            onClick={() => void open()}
            style={{
              padding: '6px 14px', border: '1px solid var(--color-border)', borderRadius: 6,
              background: 'transparent', color: 'var(--color-text-primary)', fontSize: 13,
              cursor: 'pointer', fontFamily: 'var(--font-sans)',
            }}
          >前往系统设置</button>
        </div>
        {error && <div style={{ color: 'var(--color-danger)', marginTop: 6 }}>{error}</div>}
      </div>
    </>
  )
}