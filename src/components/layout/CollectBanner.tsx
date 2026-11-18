import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import Icon from '../icons'
import Tooltip from '../ui/Tooltip'

/**
 * 启动级热键错误的顶部提示条（v0.7.9 Task 16，spec §5.6）。
 *
 * 挂载时**只读一次** `take_startup_error`（Rust 侧取走即清空）：启动注册失败或旧键
 * 恢复失败时给一句可关闭的提示，不阻塞其它功能。关掉后本次运行不再出现。
 *
 * 一次性命令必须缓存 Promise：`main.tsx` 开着 StrictMode，effect 会 setup → cleanup →
 * setup 跑两遍；两次 invoke 各自取一次，先返回的那次已经拿到值、却因为第一轮的
 * `alive` 已置 false 而丢弃，第二轮只会拿到 None——提示条永远不出现。模块级缓存让
 * 两轮共享同一次读取。
 */
let startupErrorPromise: Promise<string | null> | null = null

function takeStartupError(): Promise<string | null> {
  startupErrorPromise ??= invoke<string | null>('take_startup_error').catch(() => null)
  return startupErrorPromise
}

const BANNER_TEXT = '划词热键注册失败（可能被其他应用占用），可在设置中修改'

export default function CollectBanner() {
  const [detail, setDetail] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let alive = true
    void takeStartupError().then(message => {
      if (alive && message) setDetail(message)
    })
    return () => { alive = false }
  }, [])

  if (!detail || dismissed) return null

  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 16px', flexShrink: 0,
        background: 'color-mix(in srgb, var(--color-danger) 10%, var(--color-surface))',
        borderBottom: '1px solid color-mix(in srgb, var(--color-danger) 45%, var(--color-border))',
        color: 'var(--color-text-primary)', fontSize: 'var(--text-xs)',
      }}
    >
      <span style={{ display: 'flex', flexShrink: 0, color: 'var(--color-danger)' }}>
        <Icon name="alert" size={14} />
      </span>
      {/* Rust 的错误原文（含底层插件原因）只进统一 Tooltip，正文永远是固定短句。 */}
      <span style={{ flex: 1, minWidth: 0 }}>
        <Tooltip content={detail} tapOpen>{BANNER_TEXT}</Tooltip>
      </span>
      <Tooltip content="关闭提示">
        <button
          type="button"
          aria-label="关闭提示"
          onClick={() => setDismissed(true)}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          style={{
            width: 20, height: 20, flexShrink: 0, padding: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'transparent', borderRadius: 'var(--radius-sm)',
            cursor: 'pointer', color: 'var(--color-text-secondary)',
          }}
        >
          <Icon name="close" size={12} />
        </button>
      </Tooltip>
    </div>
  )
}
