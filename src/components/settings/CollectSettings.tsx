import { Fragment, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getConfig } from '../../lib/config'
import {
  GRAB_WORD_DEFAULT_MACOS,
  GRAB_WORD_DEFAULT_WINDOWS,
  eventToAccelerator,
  formatAccelerator,
  isModifierKeyEvent,
} from '../../lib/hotkey'
import Icon from '../icons'
import Tooltip from '../ui/Tooltip'

/**
 * 设置页「划词」分区（v0.7.9 Task 16，spec §5.6）。
 *
 * 两行：
 * 1. **抓词热键**：`rotate-ccw`（恢复默认，经 `set_shortcut` 落库）+ 当前组合键键帽 + 修改。
 *    录制态实时预览按住的修饰键，Esc 取消、Backspace 恢复原值（回到录制开始时的组合键，
 *    不保存）；恢复默认与录制出完整组合键都走同一个 `commit`（注册成功才改显示）；
 *    注册失败行内红字并保留旧值。
 * 2. **抓取日志**：标题独立一行，日志块整行宽排在下方；挂载期间每 2s 轮询一次
 *    `take_grab_log`（Rust 侧环形缓冲，最多 5 条、最新在前）。
 *
 * 前端不发全局热键插件权限：所有注册都经 `set_shortcut` 命令（controller ruling）。
 */

/** 平台默认值。与 Rust `shortcut::default_accelerator` 同一组值（注释见 `lib/hotkey.ts`）。 */
const DEFAULT_ACCELERATOR = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent)
  ? GRAB_WORD_DEFAULT_MACOS
  : GRAB_WORD_DEFAULT_WINDOWS

/** 注册失败的固定文案（spec §5.6）。Rust 的错误同样以它为准，这里不原样透出英文插件错误。 */
const COLLISION_MESSAGE = '该组合键可能已被其他应用占用，请换一个'

/** 日志行的形状（Rust serde camelCase：`{ time, mode, summary, errorKind }`）。 */
interface GrabLogEntry {
  time: string
  mode: string | null
  summary: string
  errorKind: string | null
}

const MODE_LABELS: Record<string, string> = { word: '单词', sentence: '句子' }

/** 失败类目的兜底文案：Rust 的 `summary` 为空时按 `errorKind` 给出（与 `shortcut.rs` 一致）。 */
const ERROR_LABELS: Record<string, string> = {
  empty: '未检测到选中文本',
  unsupported: '当前应用不支持读取选区',
  denied: '系统拒绝读取选区（macOS 需授予辅助功能权限）',
  timeout: '读取选区超时',
  too_long: '选区过长',
}

/** 一行日志的结果文案：成功＝模式 + 摘要；失败＝类目文案（`summary` 优先，带详情）。 */
function resultText(entry: GrabLogEntry): string {
  if (entry.errorKind) {
    return entry.summary || ERROR_LABELS[entry.errorKind] || `系统错误（${entry.errorKind}）`
  }
  const mode = entry.mode ? (MODE_LABELS[entry.mode] ?? entry.mode) : ''
  return mode ? `${mode} · ${entry.summary}` : entry.summary
}

/** invoke 的 reject 值类型不固定（Rust 侧是 `Result<_, String>`，插件层可能给 Error）。 */
function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** 按住的修饰键，顺序与 `eventToAccelerator` 一致（录制态的实时预览）。 */
function heldModifiers(e: KeyboardEvent): string[] {
  const mods: string[] = []
  if (e.ctrlKey) mods.push('Control')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  if (e.metaKey) mods.push('Super')
  return mods
}

const keycapStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minWidth: 22, height: 24, padding: '0 6px',
  border: '1px solid var(--color-border-strong)', borderRadius: 'var(--radius-sm)',
  background: 'var(--color-surface-raised)',
  fontSize: 'var(--text-xs)', fontFamily: 'var(--font-sans)',
  color: 'var(--color-text-primary)', lineHeight: 1,
}

/** 一组键帽，`+` 作分隔（与 accelerator 的书写同一顺序）。 */
function Keycaps({ keys }: { keys: string[] }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {keys.map((key, i) => (
        <Fragment key={`${key}-${i}`}>
          {i > 0 && <span style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>+</span>}
          <kbd style={keycapStyle}>{key}</kbd>
        </Fragment>
      ))}
    </span>
  )
}

const iconButtonStyle: CSSProperties = {
  width: 24, height: 24, flexShrink: 0,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', background: 'transparent', borderRadius: 'var(--radius-sm)',
  cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 0,
  transition: 'background-color var(--duration-fast) var(--ease-smooth), color var(--duration-fast) var(--ease-smooth)',
}

const textButtonStyle: CSSProperties = {
  padding: '5px 14px', border: '1px solid var(--color-border)', borderRadius: 6,
  background: 'transparent', color: 'var(--color-text-primary)', fontSize: 13,
  cursor: 'pointer', fontFamily: 'var(--font-sans)', flexShrink: 0,
}

const labelStyle: CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }

function LogLine({ entry }: { entry: GrabLogEntry }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '4px 12px', fontSize: 'var(--text-xs)', lineHeight: 1.6 }}>
      <span style={{ flexShrink: 0, color: 'var(--color-text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
        {entry.time}
      </span>
      <span style={{
        minWidth: 0, overflowWrap: 'anywhere',
        color: entry.errorKind ? 'var(--color-danger)' : 'var(--color-text-primary)',
      }}>
        {resultText(entry)}
      </span>
    </div>
  )
}

export default function CollectSettings() {
  // 当前显示的组合键。初值取平台默认，挂载后读 `shortcuts.json` 的真实值覆盖。
  const [displayed, setDisplayed] = useState(DEFAULT_ACCELERATOR)
  const [recording, setRecording] = useState(false)
  // 录制态的修饰键预览（如只按住 Alt 时显示 `Alt + …`）。
  const [draft, setDraft] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  // Rust 的原始错误只作为 tooltip，正文永远是固定文案。
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [log, setLog] = useState<GrabLogEntry[]>([])
  // 一次只允许一个 `set_shortcut` 在飞：否则连按两下会交错改键。
  const busy = useRef(false)
  // 录制开始时的组合键（Backspace「恢复原值」的取值）；只由 `startRecording` 写入。
  const originalAccelerator = useRef(DEFAULT_ACCELERATOR)

  useEffect(() => {
    let alive = true
    void getConfig()
      .then(cfg => {
        if (!alive) return
        const saved = cfg.actions?.grab_word
        if (saved) setDisplayed(saved)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // 日志轮询：只在分区挂载期间跑，失败静默（非 Tauri 环境下命令不存在）。
  useEffect(() => {
    let alive = true
    const load = () => {
      void invoke<GrabLogEntry[]>('take_grab_log')
        .then(entries => { if (alive) setLog(entries) })
        .catch(() => {})
    }
    load()
    const timer = setInterval(load, 2000)
    return () => { alive = false; clearInterval(timer) }
  }, [])

  const cancelRecording = () => {
    setRecording(false)
    setDraft([])
    setError(null)
    setErrorDetail(null)
  }

  const startRecording = () => {
    // 「恢复原值」的取值点是录制开始这一瞬，不是 config 里可能已变的当前值。
    originalAccelerator.current = displayed
    setRecording(true)
    setDraft([])
    setError(null)
    setErrorDetail(null)
  }

  const commit = async (accel: string) => {
    if (busy.current) return
    busy.current = true
    try {
      await invoke<void>('set_shortcut', { action: 'grab_word', accelerator: accel })
      setDisplayed(accel)
      setRecording(false)
      setDraft([])
      setError(null)
      setErrorDetail(null)
    } catch (e) {
      // 失败保留旧显示、留在录制态，用户可以直接再按一个组合键。
      setError(COLLISION_MESSAGE)
      setErrorDetail(errText(e))
    } finally {
      busy.current = false
    }
  }

  /** 恢复默认：与录制出组合键走同一条 `commit` 路径（spec §5.6）——注册成功才改显示。 */
  const resetToDefault = () => {
    void commit(DEFAULT_ACCELERATOR)
  }

  // 录制态：窗口级监听。用捕获阶段拦下所有按键，避免 Ctrl+R / Ctrl+W 之类的
  // 浏览器默认行为在录制时生效；Esc 取消、Backspace（含带修饰键）恢复原值，其余交给纯函数。
  useEffect(() => {
    if (!recording) return
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.code === 'Escape') { cancelRecording(); return }
      if (e.code === 'Backspace') {
        // 恢复原值：回到本次录制开始时的组合键，不保存（spec §5.6）。
        setDisplayed(originalAccelerator.current)
        cancelRecording()
        return
      }
      if (isModifierKeyEvent(e)) {
        setDraft(heldModifiers(e))
        return
      }
      const accel = eventToAccelerator(e)
      if (!accel) return
      setDraft([])
      void commit(accel)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (isModifierKeyEvent(e)) setDraft(heldModifiers(e))
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }
    // `cancelRecording` / `commit` 都只读写 state 与 ref，闭包不存在过期值问题；
    // 依赖只留 `recording`，避免每次渲染重挂监听。
  }, [recording])

  const preview: ReactNode = recording && draft.length > 0
    ? <Keycaps keys={[...draft, '…']} />
    : <Keycaps keys={formatAccelerator(displayed)} />

  return (
    <div>
      {/* 行 1：抓词热键（恢复默认图标在键帽左侧） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0' }}>
        <div style={{ flex: 1, minWidth: 0, ...labelStyle }}>抓词热键</div>
        <button
          type="button"
          aria-label="恢复默认"
          onClick={resetToDefault}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          style={iconButtonStyle}
        >
          <Icon name="rotate-ccw" size={14} />
        </button>
        {recording && draft.length === 0
          ? <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>按下组合键…</span>
          : preview}
        <button
          type="button"
          onClick={() => { if (recording) cancelRecording(); else startRecording() }}
          style={textButtonStyle}
        >
          {recording ? '取消' : '修改'}
        </button>
      </div>
      {recording && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', paddingBottom: 6 }}>
          按 Esc 取消，Backspace 恢复原值（不会立即保存）
        </div>
      )}
      {error && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)', padding: '4px 0 6px' }}>
          {errorDetail ? <Tooltip content={errorDetail} tapOpen><span>{error}</span></Tooltip> : error}
        </div>
      )}

      {/* 行 2：抓取日志（标题独立一行，块整行宽排在下方） */}
      <div style={{ marginTop: 24 }}>
        <div style={{ ...labelStyle, marginBottom: 8 }}>抓取日志</div>
        <div
          role="log"
          aria-label="抓取日志"
          style={{
            width: '100%', boxSizing: 'border-box',
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
            background: 'var(--color-surface-raised)', padding: '4px 0',
          }}
        >
          {log.length === 0
            ? (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', padding: '6px 12px' }}>
                  本次运行暂无抓取记录
                </div>
              )
            : log.slice(0, 5).map((entry, i) => <LogLine key={`${entry.time}-${i}`} entry={entry} />)}
        </div>
      </div>
    </div>
  )
}
