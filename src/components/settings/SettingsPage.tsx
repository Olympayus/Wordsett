import { useState } from 'react'
import SearchSettings from './SearchSettings'
import SidebarSettings from './SidebarSettings'
import CategorySettings from './CategorySettings'
import AboutSettings from './AboutSettings'
import DataSettings from './DataSettings'

type SectionKey = 'search' | 'sidebar' | 'category' | 'data' | 'about'
const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'search', label: '搜索设置' },
  { key: 'sidebar', label: '侧边栏显示' },
  { key: 'category', label: '分类管理' },
  { key: 'data', label: '数据' },
  { key: 'about', label: '关于' },
]

/** 内容列限宽：与工作台内容列同一量级（720px），超过则标签与开关之间出现大片空隙 */
const SETTINGS_CONTENT_WIDTH = 720

// 设置页（v0.5.2 §5）：同窗口独立页面，不是抽屉。
// 相对原 SettingsPanel 去掉了：遮罩层、translateX 滑入、inert/aria-hidden、
// useFocusTrap 焦点陷阱、Esc capture 拦截（原为阻止按键泄漏给词典页，页面形态下不存在）、
// 关闭按钮与焦点回归 #settings-trigger、480px 定宽、role="dialog"/aria-modal。
export default function SettingsPage() {
  const [active, setActive] = useState<SectionKey>('search')

  const navStyle = (isActive: boolean): React.CSSProperties => ({
    width: '100%', display: 'block', textAlign: 'left', cursor: 'pointer',
    padding: '10px 20px', fontSize: 'var(--text-sm)',
    color: isActive ? 'var(--color-brand)' : 'var(--color-text-secondary)',
    background: isActive ? 'var(--color-brand-soft)' : 'transparent',
    fontWeight: isActive ? 'var(--weight-medium)' : 'var(--weight-regular)',
    fontFamily: 'var(--font-sans)',
    border: 'none',
    borderLeft: `2px solid ${isActive ? 'var(--color-brand)' : 'transparent'}`,
    transition: 'background-color var(--duration-fast) var(--ease-smooth), color var(--duration-fast) var(--ease-smooth), border-color var(--duration-fast) var(--ease-smooth)',
  })

  return (
    // data-find-root 供 FindBar 定位当前模块的搜索根（工作台用同名属性区分）
    <div data-find-root="settings" style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
      <nav
        aria-label="设置分区"
        style={{
          width: '160px', flexShrink: 0, background: 'var(--color-canvas)',
          borderRight: '1px solid var(--color-border)', padding: '16px 0',
        }}
      >
        {SECTIONS.map(s => (
          <button key={s.key} type="button" onClick={() => setActive(s.key)} style={navStyle(active === s.key)}>
            {s.label}
          </button>
        ))}
      </nav>
      <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        {/* 内容列限宽（与工作台内容列同一 720px 量级）：开关行是「标签 … flex spacer … 开关」结构，
            不限宽时窗口越宽、标签与它的开关之间离得越远，两侧留白也随之失控。 */}
        <div style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ maxWidth: SETTINGS_CONTENT_WIDTH, display: 'flex', alignItems: 'center', padding: '20px 24px' }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)' }}>
              {SECTIONS.find(s => s.key === active)!.label}
            </div>
          </div>
        </div>
        <div style={{ maxWidth: SETTINGS_CONTENT_WIDTH, padding: '24px' }}>
          {active === 'search' && <SearchSettings />}
          {active === 'sidebar' && <SidebarSettings />}
          {active === 'category' && <CategorySettings />}
          {active === 'data' && <DataSettings />}
          {active === 'about' && <AboutSettings />}
        </div>
      </div>
    </div>
  )
}