import { useSettingsStore } from '../../stores/settingsStore'
import type { SidebarMode } from '../../lib/sidebar'
import { SMART_VIEW_META, SMART_VIEW_ORDER, LOCKED_SMART_VIEW, type SmartViewKey } from '../../lib/smartViews'
import { Toggle } from '../ui/Toggle'

const MODES: { mode: SidebarMode; title: string; desc: string }[] = [
  { mode: 'alphabet', title: '字母模式', desc: '按首字母 A-Z 排列，顺序不可改。收起后仅显示单词与色圈。' },
  { mode: 'category', title: '分类模式', desc: '按分类分组，组内可自由排序。收起后显示单词与分类名。' },
]

// v0.6.5 §4.4：侧栏四视图逐项开关的说明行。写在设置里而不是只留一个开关，
// 是因为「复习到期」按词数、「顽固词」跟阈值走，两条口径不看字面就猜不出来。
const SMART_VIEW_DESC: Record<SmartViewKey, string> = {
  all: '全部词条，无过滤；按字母或分类分组浏览',
  due: '今日有到期卡片的词条',
  weekNew: '近 7 天收录的词条',
  leech: '任一卡片连错次数达到阈值（默认 4 次）的词条',
}

// v0.5.3 §4.1（第 13 条）：说明文字在首个句号处断行，句号留在前半行。
// 无句号的文案防御性地原样返回单行。
function splitAtFirstPeriod(desc: string): string[] {
  const i = desc.indexOf('。')
  if (i < 0) return [desc]
  return [desc.slice(0, i + 1), desc.slice(i + 1)]
}

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
              {/* 说明行用 72% 不透明降一档，避免与标题抢；换色会让两层文字偏离同一族 */}
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)', opacity: 0.72, lineHeight: 1.5 }}>
                {splitAtFirstPeriod(m.desc).map((line, i) => <div key={i}>{line}</div>)}
              </div>
            </button>
          )
        })}
      </div>
      <div style={{ ...SECTION_TITLE, margin: '28px 0 6px' }}>智能视图</div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginBottom: '10px' }}>
        关闭的视图不再出现在侧栏。「完整词库」是视图未激活时的落点，不可关闭。
      </div>
      {SMART_VIEW_ORDER.map(key => {
        const locked = key === LOCKED_SMART_VIEW
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 0', borderTop: '1px solid var(--color-border)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)' }}>{SMART_VIEW_META[key].label}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{SMART_VIEW_DESC[key]}</div>
            </div>
            {locked && <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>常显</span>}
            <Toggle checked={smartViews[key]} disabled={locked} aria-label={SMART_VIEW_META[key].label}
              onChange={on => setSmartView(key, on)} />
          </div>
        )
      })}
    </>
  )
}
