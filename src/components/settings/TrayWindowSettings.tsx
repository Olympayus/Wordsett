import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getConfig, setConfig, type AppConfig } from '../../lib/config'
import { Toggle } from '../ui/Toggle'

const SECTION_TITLE: React.CSSProperties = {
  fontSize: 'var(--text-base)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-primary)',
}

/** 行式条目 + 右侧开关，与 SidebarSettings 的智能视图行同版式。 */
function ToggleRow({ label, desc, checked, onChange, last }: {
  label: string; desc: string; checked: boolean; onChange: (v: boolean) => void; last?: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 0',
      borderTop: last ? undefined : '1px solid var(--color-border)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)' }}>{label}</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{desc}</div>
      </div>
      <Toggle checked={checked} aria-label={label} onChange={onChange} />
    </div>
  )
}

/**
 * 托盘与窗口（v0.7.0 §4.6）。
 *
 * 两个开关的值都在 `shortcuts.json` 而不是 zustand：`CloseRequested` 要在
 * Rust 侧同步判断，读不到 localStorage。这里是它的唯一编辑界面。
 */
export default function TrayWindowSettings() {
  const [cfg, setCfg] = useState<AppConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 必须在下面的 `if (!cfg) return` **之前**声明：读配置期间组件会先返回一次，
  // 晚于它的 useRef 会在第二次渲染里换位置，违反 Hooks 调用顺序。
  const chain = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => { void getConfig().then(setCfg) }, [])
  if (!cfg) return <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>读取设置…</div>

  /**
   * 写完必须 `sync_tray`，否则两个开关都要重启才生效：Rust 只在启动、关窗结论
   * 和本命令里读这两个键，`setConfig` 本身不碰托盘。顺序也不能反——
   * `sync_tray` 按盘上的配置重应用，与写盘并行会读到旧值。
   *
   * 连成一串 promise：连点同一个开关时，第 2 次的写要等第 1 次的 `sync_tray` 落定，
   * 否则两次调用交错，托盘可能停在与开关相反的那一档，且看不出来。
   */
  const patch = (p: Record<string, unknown>) => {
    chain.current = chain.current.then(async () => {
      setError(null)
      try {
        setCfg(await setConfig(p))
        await invoke<void>('sync_tray')
      } catch (e) {
        // 不吞：开关已经落盘、托盘却没跟上时，用户看到的正是这里。
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  return (
    <>
      <div style={{ ...SECTION_TITLE, marginBottom: '16px' }}>托盘与窗口</div>
      <ToggleRow
        label="关闭主窗时最小化到托盘"
        desc="关掉后点关闭按钮直接退出应用，托盘图标消失。"
        checked={cfg.window.close_to_tray}
        onChange={v => void patch({ window: { close_to_tray: v } })}
      />
      <ToggleRow
        label="托盘显示今日剩余"
        desc="关闭后托盘菜单不再显示待复习数量，悬停提示只留应用名。"
        checked={cfg.tray.show_due_count}
        onChange={v => void patch({ tray: { show_due_count: v } })}
        last
      />
      {error && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)', marginTop: '8px' }}>{error}</div>}
    </>
  )
}