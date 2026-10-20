import { useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useViewStore } from '../../stores/viewStore'
import { useClickOutside } from '../../lib/useClickOutside'
import { useDueCount } from './useDueCount'

/**
 * 标题栏待复习提示（v0.6.3 条目 5）。
 *
 * 标题栏只有 48px 高，V8 原型那种竖版 rc-block（衬线大字 30px + 三四行说明）塞不下，
 * 故拆两层：26px 的 chip 常驻（与 32px 的 logo / 搜索框同一条水平轴，居中于该轴），
 * 点开才展开窗口。
 *
 * `count === 0` 时**不渲染**：两个业务条件（今天没有到期的 / 今天该复习的都做完了）
 * 都落到这一个数上——后者一旦做完，到期卡的 due_at 就被评分推走、不再落到「≤ 今天」。
 * 不留「0 张」或「已完成」的占位 chip：占位本身也是要读的一行字，而它传达的信息是「没事做」。
 * 注意这只对**到期集**成立：积压超过一轮的队列上限时，做完一轮 chip 仍显示剩余量，
 * 那是有意的（见下方取数的注释），不是没归零的缺陷。
 *
 * chip 圆角 12px：搜索框是真胶囊（--radius-full，32px 高即 16px 弧半径），
 * chip 比它收；又大于通用方块按钮（--radius-lg 8px），不与其同级。
 * chip 自己 26px 高，12px 弧半径差 1px 才是全圆，故它不是胶囊而是圆角方块。
 *
 * chip 的取数、显隐与档位规则抽在 dueChipModel 里（可测）；组件只渲染。
 * 取数 / 轮询 / 托盘上报抽在 useDueCount 里（Task 5，与手机底栏徽标共用一份）；组件只消费那个数。
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
  const count = useDueCount()
  const [open, setOpen] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)
  useClickOutside(hostRef, () => setOpen(false), open)

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
          // 展开态走中性底 + 规则线（v0.7.2 spec §6）。原来展开态铺 --color-brand-softer 底 +
          // --color-brand 边，于是 t2 档展开时同一枚 chip 上蓝（底/边）与陶土（数字）并存。
          // 现改为：底色随「待复习」这一状态走中性（--color-surface-raised 凹陷面），规则线由
          // 那道 1px --color-border 边充当（边框本就有一道，不另加线）。收起态的档位色
          // （数字 numColor / 描边 borderColor）不动——那是「待复习」的档位标记，不是这枚 chip 的展开态。
          background: open ? 'var(--color-surface-raised)' : 'var(--color-surface)',
          border: `1px solid ${open ? 'var(--color-border)' : borderColor}`,
          cursor: 'pointer', fontFamily: 'var(--font-sans)', color: 'var(--color-text-secondary)',
        }}
      >
        {/* 不套 .stat-num——这是一次明确的豁免，不是漏掉。
            .stat-num（index.css）定义四件事：无衬线字体、表格数字（tabular-nums）、主文字色、
            semibold 字重。这个数三条按自己的定法覆盖：字体走衬线（--font-serif）——它要当
            展示性标题看，不为跟别的读数对齐；字重 700；**颜色**——分档色承载信息，档位就靠
            这个数本身的颜色说（t1 深暖棕 / t2 暖橙），换回主文字色等于把档位抹掉。tabular-nums
            这一条按 v0.7.2 spec §6「数字用 tabular」采用（不再靠等宽体，改用表格数字口径）。
            四条定义里只剩颜色/字体/字重三条与 .stat-num 不同，挂这个类仍是噪音，故仍不挂。
            .stat-num 那条约定要的是「统计读数彼此长得一样」，而按档位变色的展示标题是另一回事。
            窗口里那个大数字豁免同一类（见下）。 */}
        <span
          style={{ fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 700, lineHeight: 1, color: model.numColor, fontVariantNumeric: 'tabular-nums' }}
        >{count}</span>
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
            {/* 眉标不写「今日队列」：这个数自 v0.6.3 打磨起是**到期积压量**，不是本轮队列的
                长度（队列长度受队列上限截断，通常更小）。眉标必须描述它上面那个数。 */}
            <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>今日待复习</div>
            {/* 同样不套 .stat-num，还是一次明确的豁免：理由与 chip 里那个数一致——
                分档色承载档位信息，衬线是展示性处理而非无衬线的列读数，两条都按自己的定法覆盖。
                字重这一条要说准：本元素没写 font-weight，也**没挂 .stat-num**，所以它继承祖先的
                默认字重（正文 normal 400）；「按 .stat-num 的 semibold 走」是错的——类不在这
                个元素上，那条声明无从生效。tabular-nums 与 chip 里那个数同源（v0.7.2 spec §6），
                使同一枚徽标的数字口径一致。即：声明上覆盖字体与颜色，另加 tabular-nums，其余走正文的默认值。 */}
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 30, lineHeight: 1, color: model.numColor, fontVariantNumeric: 'tabular-nums' }}>
              {count}{' '}
              <small style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 400, color: 'var(--color-text-secondary)', marginLeft: 6 }}>张待复习</small>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', lineHeight: 1.65, marginTop: 7 }}>
              {model.windowNote}
            </div>
            <div style={{ marginTop: 11, display: 'flex' }}>
              <button
                type="button"
                // 与活动栏「复习」同一个意图标记：这里只负责**请求**导航，会话是否结束不归这条
                // 入口决定——那是守卫的事。reset 归守卫所有：它拦下点击、弹确认窗，用户确认后
                // 由它自己 reset() 再重放 showModule('review')（SessionGuard.tsx:51-62），
                // 确认与否都在用户手里。所以这里**不能**自己调 reset()：那是替用户把「答到一半」
                // 判成可以走，等于绕过确认；就算不绕，也只是把守卫的职责复制一份，
                // 这条入口的语义从此要靠两处代码一起才说得清。
                // （守卫在 window 捕获阶段监听并 stopPropagation，会话进行中这个按钮的
                //   onClick 压根不会执行——上面说的「不能自己 reset」是归属问题，不是先后问题。）
                data-session-guard="module:review"
                onClick={() => { setOpen(false); showModule('review') }}
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
