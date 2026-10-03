import { useSettingsStore } from '../../stores/settingsStore'
import type { SidebarMode } from '../../lib/sidebar'
import { SMART_VIEW_META, SMART_VIEW_ORDER, LOCKED_SMART_VIEW } from '../../lib/smartViews'
import { Toggle } from '../ui/Toggle'

const MODES: { mode: SidebarMode; title: string; desc: string }[] = [
  { mode: 'alphabet', title: '字母模式', desc: '按首字母 A-Z 排列，顺序不可改。收起后仅显示单词与色圈。' },
  { mode: 'category', title: '分类模式', desc: '按分类分组，组内可自由排序。收起后显示单词与分类名。' },
]

// v0.6.5 §4.4：侧栏四视图逐项开关。说明文字一遍遍地复述视图名（「今日有到期卡片的词条」
// 之于「复习到期」），2026-10-03 按用户要求全部去掉；口径差异改由视图名本身承担。
// `SMART_VIEW_DESC` 与 `splitAtFirstPeriod` 随之删除——留着不渲染只会让人以为还在生效。

// v0.5.3 §4.1（第 11 条）：与 SearchSettings 的 SECTION_TITLE 同一处理 —— 字号 +2 并加粗。
// 提为模块级常量，便于与 SearchSettings 的小标题保持一致。
const SECTION_TITLE: React.CSSProperties = { fontSize: 'var(--text-base)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-primary)' }

// 侧边栏显示控制（规格 §7.4）：两个单选卡片，切换即时生效
export default function SidebarSettings() {
  const sidebarMode = useSettingsStore(s => s.sidebarMode)
  const setSidebarMode = useSettingsStore(s => s.setSidebarMode)
  const smartViews = useSettingsStore(s => s.smartViews)
  const setSmartView = useSettingsStore(s => s.setSmartView)
  return (
    <>
      <div id="sidebar-mode-heading" style={{ ...SECTION_TITLE, marginBottom: '16px' }}>
        侧边栏显示模式
      </div>
      <div role="radiogroup" aria-labelledby="sidebar-mode-heading" style={{ display: 'flex', gap: '12px' }}>
        {MODES.map(m => {
          const selected = sidebarMode === m.mode
          return (
            <button
              key={m.mode}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setSidebarMode(m.mode)}
              style={{
                flex: 1, padding: '16px', cursor: 'pointer', textAlign: 'left',
                borderRadius: 'var(--radius-lg)',
                // C3′（v0.6.2 条目 7）：两个字框的**字色一律是基础字色**、标题加粗，
                // 品牌蓝只留在选中框的圆点与描边上。未选框用暖中性底
                // （--color-surface-sunken），与选中框的品牌浅底形成同深度、异色相的成对关系——
                // 原实现未选框是全透明，退成裸文本，两个框不成对。
                border: `2px solid ${selected ? 'color-mix(in srgb, var(--color-brand) 35%, white)' : 'var(--color-border-strong)'}`,
                background: selected ? 'var(--color-brand-soft)' : 'var(--color-surface-sunken)',
                fontFamily: 'var(--font-sans)',
                transition: 'background-color var(--duration-fast) var(--ease-smooth), border-color var(--duration-fast) var(--ease-smooth)',
              }}
              // v0.6.3 条目 19：未选框的常态描边与下面两个 hover 赋值**是同一档**
              // （--color-border-strong），三处必须同步，否则鼠标一移开就掉回更浅的一档。
              // 因此这两个 handler 目前没有可见效果，保留只为标记「未来的 hover 档写在这里」——
              // 卡片现在没有 hover 反馈，这是本任务的结果，不是待修的缺陷。
              onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--color-border-strong)' }}
              onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--color-border-strong)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '6px' }}>
                <span style={{
                  width: 12, height: 12, flexShrink: 0, borderRadius: '50%',
                  border: selected ? '2px solid var(--color-brand)' : '1.5px solid var(--color-border-strong)',
                  background: selected ? 'var(--color-brand)' : 'transparent',
                }} />
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)' }}>{m.title}</span>
              </div>
              {/* 说明行用 72% 不透明降一档，避免与标题抢；换色会让两层文字偏离同一族。
                  两处说明都在首个句号处断开（v0.5.3 §4.1 第 13 条；无句号的文案原样返回单行），
                  原先抽成 splitAtFirstPeriod 函数，只有这里一个调用点，故内联。 */}
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)', opacity: 0.72, lineHeight: 1.5 }}>
                {(m.desc.indexOf('。') < 0
                  ? [m.desc]
                  : [m.desc.slice(0, m.desc.indexOf('。') + 1), m.desc.slice(m.desc.indexOf('。') + 1)]
                ).map((line, i) => <div key={i}>{line}</div>)}
              </div>
            </button>
          )
        })}
      </div>
      <div style={{ ...SECTION_TITLE, margin: '28px 0 10px' }}>智能视图</div>
      {SMART_VIEW_ORDER.map(key => {
        const locked = key === LOCKED_SMART_VIEW
        return (
          <div key={key} style={{
            display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 0',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--text-sm)' }}>{SMART_VIEW_META[key].label}</div>
            </div>
            {/* 「完整词库」不可关闭，它那一档就不是开关而是状态说明（v0.6.5 修订）：
                原来是一条禁用开关 + 一个「常显」，禁用开关既点不动又占着一列，
                等于把「不可关闭」这件事说了两遍。现在只在开关原来的位置上写「常显」，
                宽度取 Toggle 的 36px，右端于是与下面三行的开关对齐。 */}
            {locked
              ? <span style={{
                  width: '36px', height: '20px', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '11px', color: 'var(--color-text-tertiary)',
                }}>常显</span>
              : <Toggle checked={smartViews[key]} aria-label={SMART_VIEW_META[key].label}
                  onChange={on => setSmartView(key, on)} />}
          </div>
        )
      })}
    </>
  )
}
