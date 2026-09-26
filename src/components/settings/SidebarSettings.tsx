import { useSettingsStore } from '../../stores/settingsStore'
import type { SidebarMode } from '../../lib/sidebar'

const MODES: { mode: SidebarMode; title: string; desc: string }[] = [
  { mode: 'alphabet', title: '字母模式', desc: '按首字母 A-Z 排列，顺序不可改。收起后仅显示单词与色圈。' },
  { mode: 'category', title: '分类模式', desc: '按分类分组，组内可自由排序。收起后显示单词与分类名。' },
]

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
  return (
    <>
      <div style={{ ...SECTION_TITLE, marginBottom: '16px' }}>
        侧边栏显示模式
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
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
                border: `2px solid ${selected ? 'color-mix(in srgb, var(--color-brand) 35%, white)' : 'var(--color-border)'}`,
                background: selected ? 'var(--color-brand-soft)' : 'var(--color-surface-sunken)',
                fontFamily: 'var(--font-sans)',
                transition: 'background-color var(--duration-fast) var(--ease-smooth), border-color var(--duration-fast) var(--ease-smooth)',
              }}
              onMouseEnter={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--color-border-strong)' }}
              onMouseLeave={e => { if (!selected) e.currentTarget.style.borderColor = 'var(--color-border)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '6px' }}>
                <span style={{
                  width: 12, height: 12, flexShrink: 0, borderRadius: '50%',
                  border: `1.5px solid ${selected ? 'var(--color-brand)' : 'var(--color-border-strong)'}`,
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
    </>
  )
}
