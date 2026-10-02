import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import SearchSettings from './SearchSettings'
import ReviewSettings from './ReviewSettings'
import SidebarSettings from './SidebarSettings'
import TrayWindowSettings from './TrayWindowSettings'
import CategorySettings from './CategorySettings'
import AboutSettings from './AboutSettings'
import DataSettings from './DataSettings'
import PlatformSettings from './PlatformSettings'

type SectionKey = 'search' | 'review' | 'tray' | 'sidebar' | 'category' | 'data' | 'platform' | 'about'
const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'search', label: '搜索设置' },
  { key: 'review', label: '复习' },
  { key: 'tray', label: '托盘与窗口' },
  { key: 'sidebar', label: '侧边栏显示' },
  { key: 'category', label: '分类管理' },
  { key: 'data', label: '数据' },
  { key: 'platform', label: '平台权限' },
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

  // 「平台权限」分区只在 macOS 存在。**导航项本身也要按平台过滤**——否则 Windows 上
  // 会留下一个点进去一片空白的导航项，与 03 §2.5「Windows 无此分区」相冲突。
  const [platformSupported, setPlatformSupported] = useState(false)
  useEffect(() => {
    void invoke<{ supported: boolean }>('accessibility_status').then(s => setPlatformSupported(s.supported))
  }, [])
  const sections = SECTIONS.filter(s => s.key !== 'platform' || platformSupported)

  // v0.5.3 §4.1（第 10 条）：左栏文字改黑色衬线体。两种状态文字都取近黑
  // （--color-text-primary，#1C1814）；选中态改由「暖品牌底 + 2px 品牌色左边条 + 加粗」承载，
  // 颜色与底色一起提示，避免文字再靠蓝/灰二色区分。
  const navStyle = (isActive: boolean): React.CSSProperties => ({
    width: '100%', display: 'block', textAlign: 'left', cursor: 'pointer',
    padding: '10px 20px', fontSize: 'var(--text-sm)',
    color: 'var(--color-text-primary)',
    background: isActive ? 'var(--color-brand-soft)' : 'transparent',
    fontWeight: isActive ? 'var(--weight-bold)' : 'var(--weight-regular)',
    fontFamily: 'var(--font-serif)',
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
        {sections.map(s => (
          <button key={s.key} type="button" onClick={() => setActive(s.key)} style={navStyle(active === s.key)}>
            {s.label}
          </button>
        ))}
      </nav>
      {/* 右侧内容列用白底，与工作台正文区同一底色（v0.5.2 修订）；左侧 160px 分区导航保留 canvas 暖底，
          两者形成分区，整个窗口的设计语言统一为「暖底导航 + 白底内容」 */}
      <div style={{ flex: 1, overflowY: 'auto', minWidth: 0, background: 'var(--color-surface)' }}>
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
          {active === 'review' && <ReviewSettings />}
          {active === 'tray' && <TrayWindowSettings />}
          {active === 'sidebar' && <SidebarSettings />}
          {active === 'category' && <CategorySettings />}
          {active === 'data' && <DataSettings />}
          {active === 'platform' && <PlatformSettings />}
          {active === 'about' && <AboutSettings />}
        </div>
      </div>
    </div>
  )
}