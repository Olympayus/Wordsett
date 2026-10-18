import { useState } from 'react'
import type { TabKey } from '../../lib/tabs'
import { TAB_GROUPS } from '../../lib/tabs'
import { TAB_ITEM_PADDING_X, TAB_STRIP_PADDING } from '../../lib/layout'
import ContextMenu from '../ui/ContextMenu'
import Icon from '../icons'

interface TabBarProps {
  tabs: TabKey[]
  activeTab: TabKey
  missing: TabKey[]
  onSelect: (t: TabKey) => void
  onAddTab: (t: TabKey) => void
  onDeleteTab: (t: TabKey) => void
  /** 编者模式：页签右端现出一枚 ×（删标签页）。普通模式不渲染——危险动作只在编者视角现形。 */
  editorMode?: boolean
}

// 页签条的底是 --color-surface-sunken（#F5F3ED, L* 95.84）。凹陷面上不能往更暗走——全站
// 凹陷档全挤在 L* 93–96，共享的 --color-surface-hover（#F0F1EE, L* 95.0）压上去只有 0.84 L*、
// hover 几乎看不见（v0.7.2 前这里用字面 #FAF9F6，约 4.5 L*）。凹陷面上只能往更亮一档、朝
// --color-surface 走——那就是 --color-surface-hover-recessed（surface 与 sunken 的 50/50 混合
// #FAF9F6，L* 97.93），离条面 2.08 L*、离白面 2.07 L*，恰在两者中点——看得见，又不至于白得
// 像激活页签。该值现由 tokens.css 统一出（--color-surface-hover-recessed，各处凹陷面共用），
// 此处只引用。别改回 --color-surface-hover。
const TAB_HOVER_BG = 'var(--color-surface-hover-recessed)'  // #FAF9F6

export default function TabBar({ tabs, activeTab, missing, onSelect, onAddTab, onDeleteTab, editorMode = false }: TabBarProps) {
  const [addOpen, setAddOpen] = useState(false)
  const [ctx, setCtx] = useState<{ tab: TabKey; x: number; y: number } | null>(null)

  return (
    // 条面底 = --color-surface-sunken：**刻意偏离设计稿**——设计稿 .tabs 用 --paper（showcase-v2:172），
    // 而 --paper = #F9F8F5 正是我们的 --color-canvas；两页（此处与词典返回页 DictDetailPanel）都走 sunken。
    // 分支基线时 sunken 是更暗的一档（#EFECE5），条面确实凹陷，v0.7.2 的新档位只是压缩了这一步、
    // 未撤销意图——勿改回 canvas，否则白页签落白页、hover 的凹陷值（TAB_HOVER_BG）也失去依据。
    // 内边距取 layout.ts 的 TAB_STRIP_PADDING（v0.7.3 尾段 §4.1 / D18）：条面 24px 对齐内容列左缘，
    // 与返回页共用一份。条面**不持 marginTop**（P13(a)）——先前那条 marginTop:14 把「头带 → 页签条」
    // 的距离推到 22px（头带自己的 8px 下内距 + 14），返回页则是 20px（12+8）；删净后两页都只留
    // 头带那 8px 下内距。
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, padding: TAB_STRIP_PADDING, background: 'var(--color-surface-sunken)', borderBottom: '2px solid var(--color-border-strong)', position: 'relative' }}>
      {tabs.map(t => {
        const active = t === activeTab
        return (
          // 外层 span 承载 ×：标签是 <button>，× 也是 <button>，两者平级（不嵌套交互元素）。
          // × 绝对定位在页签右内边距里，仅编者模式渲染——「删除此标签页」那行红字已删，改由此承担。
          <span key={t} style={{ position: 'relative', display: 'inline-flex', alignItems: 'flex-end' }}>
            <button
              type="button"
              onClick={() => onSelect(t)}
              onContextMenu={e => { e.preventDefault(); setCtx({ tab: t, x: e.clientX, y: e.clientY }) }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.background = TAB_HOVER_BG; e.currentTarget.style.color = 'var(--color-text-primary)' } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)' } }}
              style={{
                position: 'relative', padding: TAB_ITEM_PADDING_X, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
                borderRadius: '8px 8px 0 0', zIndex: 1, border: 'none', fontFamily: 'var(--font-sans)',
                background: active ? 'var(--color-surface)' : 'transparent',
                color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                fontWeight: active ? 600 : 400,
                ...(active ? { border: '1px solid var(--color-border)', borderBottom: 'none', marginBottom: -2 } : {}),
              }}
            >
              {TAB_GROUPS[t].label}
            </button>
            {editorMode && (
              <button
                type="button"
                title={`删除「${TAB_GROUPS[t].label}」标签页`}
                aria-label={`删除「${TAB_GROUPS[t].label}」标签页`}
                onClick={() => onDeleteTab(t)}
                style={{
                  position: 'absolute', right: 1, top: 1, zIndex: 2,
                  width: 12, height: 12, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: 'none', background: 'transparent', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  color: 'var(--color-text-tertiary)',
                  transition: 'color var(--duration-fast) var(--ease-smooth)',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-danger)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
              >
                <Icon name="close" size={10} />
              </button>
            )}
          </span>
        )
      })}

      <div style={{ position: 'relative', marginLeft: 8, marginBottom: 5 }}>
        <button
          type="button" title="添加标签页" aria-label="添加标签页"
          onClick={() => setAddOpen(v => !v)}
          onMouseEnter={e => { e.currentTarget.style.background = TAB_HOVER_BG; e.currentTarget.style.color = 'var(--color-text-primary)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
          style={{
            width: 26, height: 26, borderRadius: 6, border: 'none', background: 'transparent',
            cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: 17, fontWeight: 600,
            lineHeight: 1, fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          +
        </button>

        {addOpen && (
          <>
            {/* 点空白处关闭下拉（遮罩高于标签 z 1，低于下拉浮层 z-dropdown） */}
            <div className="fixed inset-0" style={{ zIndex: 2 }} onClick={() => setAddOpen(false)} />
            <div
              style={{
                position: 'absolute', right: 0, top: 'calc(100% + 4px)', minWidth: 120, padding: 4,
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                borderRadius: 6, boxShadow: 'var(--shadow-overlay)', zIndex: 'var(--z-dropdown)',
              }}
            >
              {missing.length === 0 && <div style={{ padding: '6px 10px', fontSize: 13, color: 'var(--color-text-tertiary)' }}>无可添加的标签页</div>}
              {missing.map(t => (
                <button
                  key={t} type="button"
                  onClick={() => { setAddOpen(false); onAddTab(t) }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', border: 'none', background: 'transparent', borderRadius: 4, cursor: 'pointer', fontSize: 13, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}
                >
                  {TAB_GROUPS[t].label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 标签页右键菜单：打开 / 删除 */}
      {ctx && (
        <ContextMenu
          x={ctx.x}
          y={ctx.y}
          onClose={() => setCtx(null)}
          items={[
            { key: 'open', label: '打开', onSelect: () => onSelect(ctx.tab) },
            { key: 'delete', label: '删除', danger: true, onSelect: () => onDeleteTab(ctx.tab) },
          ]}
        />
      )}
    </div>
  )
}
