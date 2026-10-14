import { useState } from 'react'
import type { TabKey } from '../../lib/tabs'
import { TAB_GROUPS } from '../../lib/tabs'
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

export default function TabBar({ tabs, activeTab, missing, onSelect, onAddTab, onDeleteTab, editorMode = false }: TabBarProps) {
  const [addOpen, setAddOpen] = useState(false)
  const [ctx, setCtx] = useState<{ tab: TabKey; x: number; y: number } | null>(null)

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, padding: '4px 24px 0', background: 'var(--color-surface-sunken)', borderBottom: '2px solid var(--color-border-strong)', position: 'relative', marginTop: 14 }}>
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
              onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'var(--color-surface-hover)'; e.currentTarget.style.color = 'var(--color-brand)' } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)' } }}
              style={{
                position: 'relative', padding: editorMode ? '7px 26px 7px 20px' : '7px 20px', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
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
                  position: 'absolute', right: 6, top: 6, zIndex: 2,
                  width: 15, height: 15, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: 'none', background: 'transparent', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  color: 'var(--color-text-tertiary)',
                  transition: 'color var(--duration-fast) var(--ease-smooth)',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-danger)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
              >
                <Icon name="close" size={12} />
              </button>
            )}
          </span>
        )
      })}

      <div style={{ position: 'relative', marginLeft: 8, marginBottom: 5 }}>
        <button
          type="button" title="添加标签页" aria-label="添加标签页"
          onClick={() => setAddOpen(v => !v)}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface)'; e.currentTarget.style.boxShadow = 'var(--shadow-soft)'; e.currentTarget.style.color = 'var(--color-brand)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}
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
