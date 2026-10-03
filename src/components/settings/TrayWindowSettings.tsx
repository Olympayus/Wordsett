import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getConfig, setConfig, type AppConfig } from '../../lib/config'
import { Toggle } from '../ui/Toggle'

/** invoke 的 reject 值类型不固定（Rust 侧是 `Result<_, String>`，但插件层可能给 Error）。 */
function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
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
 *
 * 2026-10-03：**不再自画标题**。此前面板内又写了一遍「托盘与窗口」（无衬线、`--text-base`
 * 加粗），而设置页头部已经用衬线大字给出该分区名，同一屏出现两个同名标题、两种字体。
 * 分区名由头部那一处承载即可。
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
   *
   * **两段 try 分开，因为两件事失败后的处境相反，提示不能混成一条**：
   * - 写盘失败：`setConfig` 什么都没存（`set_patch` 原子写、只在成功后更新缓存），
   *   开关停在旧值是如实的，提示就是「没存上」的原因。
   * - 托盘同步失败：配置**已经存了**，开关停在新值，如实反映了盘上状态。
   *   偏偏这一档最难自查——用户同时看到「设置变了」和「托盘没动」。
   * 合成一个 catch 会让两者无法分辨，故这里分开写。
   */
  const patch = (p: Record<string, unknown>) => {
    chain.current = chain.current.then(async () => {
      setError(null)
      let next: AppConfig
      try {
        next = await setConfig(p)
      } catch (e) {
        setError(`设置未保存：${errText(e)}`)
        return
      }
      setCfg(next)
      try {
        await invoke<void>('sync_tray')
      } catch (e) {
        setError(`设置已保存，但托盘未更新（可能需要重启应用）：${errText(e)}`)
      }
    })
  }

  return (
    <>
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