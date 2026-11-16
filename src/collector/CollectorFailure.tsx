import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import Icon from '../components/icons'
import { Button } from '../components/ui/Button'
import { BottomBar, CollectorTitleBar, WORD_HEAD_STYLE } from './CollectorWord'
import type { GrabErrorKind } from './types'

/**
 * 小窗的失败卡（v0.7.9 spec §5.1 的失败类目 / §5.3 的失败态）。
 *
 * 图标 + 标题 + 原因文案；底栏「重试」（Root 执行焦点回流序列）。macOS 因未授权
 * 辅助功能而失败时额外给「前往系统设置」——复用平台权限命令
 * `open_accessibility_settings`（`lib.rs` 的 `generate_handler!` 已注册），
 * 且只在 `accessibility_status` 报告 `supported`（＝ macOS）时出现。
 *
 * 「选区过长」与「词典未收录」复用同一卡形、只是文案不同（spec §6.2）：
 * 前者带 N 个词，后者由调用方提供「打开详情页」出口。
 */

export interface CollectorFailureProps {
  error: { kind: GrabErrorKind; detail: string } | null
  /** 没有 error 对象时由调用方直接指定类目（词典未收录 / 防御性的选区过长）。 */
  kindOverride?: 'too_long' | 'not_found'
  onRetry: () => void
  /** 词典未收录时的出口（该卡没有可收录的内容，打开详情页是唯一有意义的动作）。 */
  onOpenDict?: () => void
  /** 「词典未收录」卡要显示词头（spec §5.3：词头 + 提示）。 */
  word?: string
}

type FailureKind = GrabErrorKind | 'not_found'

interface FailureCopy { title: string; detail: string }

function failureCopy(kind: FailureKind, rawDetail: string): FailureCopy {
  switch (kind) {
    case 'empty':
      return { title: '未检测到选中文本', detail: '请先选中文本，再按热键。' }
    case 'unsupported':
      return { title: '当前应用不支持读取选区', detail: '该应用没有提供可读取的文本选区。' }
    case 'denied':
      return { title: '没有读取选区的权限', detail: '请在系统设置中授予辅助功能权限后再试。' }
    case 'timeout':
      return { title: '读取选区超时', detail: '请重试。' }
    case 'too_long': {
      // Rust 给的 detail 已是一句完整文案（「选区过长（N 个词），请缩小选区」）；
      // 标题已经说了「选区过长」，正文只取 N 与建议，避免同一句话读两遍。
      const words = /（(\d+) 个词）/.exec(rawDetail)?.[1]
      return {
        title: '选区过长',
        detail: words ? `选区包含 ${words} 个词，请缩小选区。` : (rawDetail || '请缩小选区后重试。'),
      }
    }
    case 'not_found':
      return { title: '词典未收录该词', detail: '词典中没有这个词，无法收录。' }
    case 'os':
      return { title: '读取选区时发生错误', detail: rawDetail || '系统返回了未知错误。' }
  }
}

const LINK_BUTTON_STYLE = {
  alignSelf: 'flex-start' as const,
  border: 'none',
  background: 'transparent',
  padding: 0,
  color: 'var(--color-brand)',
  fontFamily: 'var(--font-sans)',
  fontSize: '12.5px',
  lineHeight: 1.5,
  cursor: 'pointer',
  textDecoration: 'underline',
}

export function CollectorFailure({ error, kindOverride, onRetry, onOpenDict, word }: CollectorFailureProps) {
  const kind: FailureKind = kindOverride ?? error?.kind ?? 'os'
  const copy = failureCopy(kind, error?.detail ?? '')

  // 「前往系统设置」只对 macOS 有意义（`accessibility_status.supported` 仅 mac 为真）。
  const [canOpenSettings, setCanOpenSettings] = useState(false)
  useEffect(() => {
    if (kind !== 'denied') return
    let cancelled = false
    void invoke<{ supported: boolean }>('accessibility_status')
      .then(s => { if (!cancelled) setCanOpenSettings(s.supported) })
      .catch(() => { /* 探测失败就不出按钮：不能给一个点了没反应的入口 */ })
    return () => { cancelled = true }
  }, [kind])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--color-surface)' }}>
      <CollectorTitleBar />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '18px 16px 20px' }}>
        {kind === 'not_found' && word && <div style={WORD_HEAD_STYLE}>{word}</div>}
        <div
          role="alert"
          style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}
        >
          <span style={{ flexShrink: 0, paddingTop: '1px', color: 'var(--color-danger)' }}>
            <Icon name="alert" size={18} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
            <span style={{ fontSize: '13.5px', fontWeight: 600, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
              {copy.title}
            </span>
            <span style={{ fontSize: '12.5px', lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>
              {copy.detail}
            </span>
            {kind === 'denied' && canOpenSettings && (
              <button
                type="button"
                style={LINK_BUTTON_STYLE}
                onClick={() => {
                  void invoke('open_accessibility_settings').catch(e => console.error('[collector] 打开系统设置失败', e))
                }}
              >
                前往系统设置
              </button>
            )}
          </div>
        </div>
      </div>
      <BottomBar>
        {onOpenDict && <Button variant="secondary" onClick={onOpenDict}>打开详情页</Button>}
        <Button onClick={onRetry}>重试</Button>
      </BottomBar>
    </div>
  )
}
