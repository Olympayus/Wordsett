import { useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useViewStore } from '../../stores/viewStore'
import { useReviewSessionStore } from '../../stores/reviewSessionStore'
import { useClickOutside } from '../../lib/useClickOutside'

/**
 * 标题栏待复习提示（v0.6.3 条目 5）。
 *
 * 标题栏只有 48px 高，V8 原型那种竖版 rc-block（衬线大字 30px + 三四行说明）塞不下，
 * 故拆两层：26px 的 chip 常驻（与 32px 的 logo / 搜索框同一条水平轴，居中于该轴），
 * 点开才展开窗口。
 *
 * `count === 0` 时**不渲染**：两个业务条件（今天没有可复习的 / 今天该复习的都做完了）
 * 都落到这一个数上——后者一旦做完，到期数就被评分推走归零。不留「0 张」或「已完成」
 * 的占位 chip：占位本身也是要读的一行字，而它传达的信息是「没事做」。
 *
 * chip 圆角 12px：小于右侧搜索框（胶囊，26px 高时弧半径 13px 即全圆），
 * 大于通用方块按钮（--radius-lg 8px）。
 *
 * chip 的取数、显隐与档位规则抽在 dueChipModel 里（可测）；组件只渲染。
 */

/** chip 的两档：1–20 深暖棕、21+ 暖橙。**字号两档相同**——变了 chip 会在两档间跳动。 */
export interface DueChipModel {
  tier: 't1' | 't2'
  numColor: string
  windowNote: string
  style: { height: number; borderRadius: number; padding: string; fontSize: number }
}

const CHIP_STYLE = { height: 26, borderRadius: 12, padding: '0 11px', fontSize: 11.5 } as const

export function dueChipModel(count: number, show: boolean): DueChipModel | null {
  if (!show || count <= 0) return null
  const tier = count > 20 ? 't2' : 't1'
  return {
    tier,
    numColor: tier === 't2' ? 'var(--color-accent)' : 'var(--color-warm-deep)',
    windowNote: tier === 't2'
      ? '积压较多，建议先做一轮今日复习再添新词。'
      : '数量不大，按原来的节奏做完即可。',
    style: { ...CHIP_STYLE },
  }
}

export default function DueBadge() {
  const show = useSettingsStore(s => s.review.showDueBadge)
  const showModule = useViewStore(s => s.showModule)
  const resetSession = useReviewSessionStore(s => s.reset)
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)
  useClickOutside(hostRef, () => setOpen(false), open)

  // 取数与 ActivityRail 原先那份同源（getStrategyCounts 的 today），每分钟轮询。
  // 动态 import 避免把数据库层拉进标题栏的首屏。
  useEffect(() => {
    if (!show) return
    let alive = true
    const refresh = async () => {
      const { getStrategyCounts, REVIEW_DEFAULTS } = await import('../../services/reviewService')
      const c = await getStrategyCounts(REVIEW_DEFAULTS)
      if (alive) setCount(c.today)
    }
    refresh()
    const timer = setInterval(refresh, 60_000)
    return () => { alive = false; clearInterval(timer) }
  }, [show])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const model = dueChipModel(count, show)
  if (!model) return null

  const borderColor = model.tier === 't2'
    ? 'color-mix(in srgb, var(--color-accent) 40%, white)'
    : 'var(--color-border-strong)'

  return (
    <div ref={hostRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${count} 张待复习`}
        onClick={() => setOpen(v => !v)}
        style={{
          ...model.style,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: open ? 'var(--color-brand-softer)' : 'var(--color-surface)',
          border: `1px solid ${open ? 'var(--color-brand)' : borderColor}`,
          cursor: 'pointer', fontFamily: 'var(--font-sans)', color: 'var(--color-text-secondary)',
        }}
      >
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 700, lineHeight: 1, color: model.numColor }}>{count}</span>
        <span>张待复习</span>
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 34, left: 0, zIndex: 'var(--z-dropdown)' }}>
          <div style={{
            width: 246, background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 9, padding: '12px 13px', boxShadow: 'var(--shadow-overlay)', position: 'relative',
          }}>
            {/* 指向 chip 的箭头 */}
            <div style={{
              position: 'absolute', top: -5, left: 18, width: 9, height: 9, background: 'var(--color-surface)',
              borderLeft: '1px solid var(--color-border)', borderTop: '1px solid var(--color-border)', transform: 'rotate(45deg)',
            }} />
            <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>今日队列</div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 30, lineHeight: 1, color: model.numColor }}>
              {count}{' '}
              <small style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 400, color: 'var(--color-text-secondary)', marginLeft: 6 }}>张待复习</small>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', lineHeight: 1.65, marginTop: 7 }}>
              {model.windowNote}
            </div>
            <div style={{ marginTop: 11, display: 'flex' }}>
              <button
                type="button"
                onClick={() => { setOpen(false); resetSession(); showModule('review') }}
                style={{
                  flex: 1, padding: '5px 10px', borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                  color: 'var(--color-text-primary)', fontSize: 12, fontFamily: 'var(--font-sans)', cursor: 'pointer',
                }}
              >去复习</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
