import { useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useViewStore } from '../../stores/viewStore'
import { getTodayDeliverableCount, REVIEW_DEFAULTS } from '../../services/reviewService'
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
 * chip 圆角 12px：搜索框是真胶囊（--radius-full，32px 高即 16px 弧半径），
 * chip 比它收；又大于通用方块按钮（--radius-lg 8px），不与其同级。
 * chip 自己 26px 高，12px 弧半径差 1px 才是全圆，故它不是胶囊而是圆角方块。
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
  const activeModule = useViewStore(s => s.activeModule)
  // 影响这个数的三个设置（leechThreshold 只影响 weak，与到期数无关）：控台传的是
  // `{ ...REVIEW_DEFAULTS, ...reviewSettings }`，这里必须跟它同一份，否则用户改过额度后
  // chip 与控台又会分出两个数。分开订阅是刻意的：整体订阅会在任何复习设置变动时重建定时器。
  const retention = useSettingsStore(s => s.review.retention)
  const newCardQuota = useSettingsStore(s => s.review.newCardQuota)
  const queueLimit = useSettingsStore(s => s.review.queueLimit)
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)
  useClickOutside(hostRef, () => setOpen(false), open)

  // 取数：与控制台空闲态那个「n 张待复习」**同一个数**（v0.6.3 评审 F1），每分钟轮询一次。
  // 原先读 getStrategyCounts().today——那份只过字段掩码，不看当日额度（queueLimit）与两道模板
  // 闸门，于是同一行文案在标题栏与控制台会印出两个数（到期积压 45、额度只放 30；例句取不到的
  // 词被闸门挡在组卷侧、chip 永远不归零）。现在读 getTodayDeliverableCount，它与
  // getOverview().total 是同一段代码，故与控台必然同值。
  // 参数必须是用户设置：控台用的是 `{ ...REVIEW_DEFAULTS, ...reviewSettings }`，
  // 只传 REVIEW_DEFAULTS 会在用户改过额度后与控台再次分家。只订阅影响这个数的三个字段，
  // 免得改一个无关设置就重建定时器。
  // 成本：有界只读（≤ queueLimit 张卡各 2~3 条 SELECT + 固定 2 条），不写库——见该函数的注释。
  // 依赖里带 activeModule：离开复习模块时补取一次。做完一整轮、退出复习模块，
  // chip 立刻重新取数（验收项「做完整轮复习后 chip 消失」靠的就是这一下）；
  // 不带的话只能等下一次轮询，那个数最坏要在屏上滞留一分钟。
  useEffect(() => {
    if (!show) return
    let alive = true
    const params = { ...REVIEW_DEFAULTS, retention, newCardQuota, queueLimit }
    const refresh = async () => {
      const n = await getTodayDeliverableCount(params)
      if (alive) setCount(n)
    }
    refresh()
    const timer = setInterval(refresh, 60_000)
    return () => { alive = false; clearInterval(timer) }
  }, [show, activeModule, retention, newCardQuota, queueLimit])

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
        {/* 不套 .stat-num（index.css:23）——这是一次明确的豁免，不是漏掉。
            .stat-num 只定义三件事：等宽字体、主文字色、semibold 字重。这个数三条全覆盖：
            衬线（--font-serif）因为它要当展示性标题看，不为跟别的读数对齐；字重 700；
            **颜色**——分档色承载信息，档位就靠这个数本身的颜色说（t1 深暖棕 / t2 暖橙），
            换回主文字色等于把档位抹掉。三条定义全被有意覆盖时挂这个类只是噪音。
            .stat-num 那条约定要的是「统计读数彼此长得一样」，而按档位变色的展示标题是另一回事。
            窗口里那个大数字豁免同一类，但只覆盖两条（见下）。 */}
        <span
          style={{ fontFamily: 'var(--font-serif)', fontSize: 15, fontWeight: 700, lineHeight: 1, color: model.numColor }}
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
            <div style={{ fontSize: 11.5, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>今日队列</div>
            {/* 同样不套 .stat-num，还是一次明确的豁免：理由与 chip 里那个数一致——
                分档色承载档位信息，衬线是展示性处理而非等宽读数，两条都按自己的定法覆盖。
                字重这一条要说准：本元素没写 font-weight，也**没挂 .stat-num**，所以它继承祖先的
                默认字重（正文 normal 400）；「按 .stat-num 的 semibold 走」是错的——类不在这
                个元素上，那条声明无从生效。即：声明上只覆盖两条，第三条走的是正文的默认值。 */}
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
