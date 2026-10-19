import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import SearchSettings from './SearchSettings'
import ReviewSettings from './ReviewSettings'
import VoiceSettings from './VoiceSettings'
import SidebarSettings from './SidebarSettings'
import TrayWindowSettings from './TrayWindowSettings'
import CategorySettings from './CategorySettings'
import AboutSettings from './AboutSettings'
import DataSettings from './DataSettings'
import PlatformSettings from './PlatformSettings'
import AppearanceSettings from './AppearanceSettings'
import SectionHeading from './SectionHeading'

type SectionKey = 'general' | 'search' | 'review' | 'voice' | 'category' | 'platform' | 'about'
const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'general', label: '通用' },
  { key: 'search', label: '搜索设置' },
  { key: 'review', label: '复习' },
  { key: 'voice', label: '语音' },
  { key: 'category', label: '分类管理' },
  { key: 'platform', label: '平台权限' },
  { key: 'about', label: '关于' },
]

/** 内容列限宽 720px（工作台内容列 v0.7.2 起是 ENTRY_BAND_WIDTH = 900px，两者不再等值，
 *  但仍属同一量级）；不限宽时窗口越宽、标签与开关之间离得越远，两侧留白也随之失控。 */
const SETTINGS_CONTENT_WIDTH = 720

// 设置页（v0.5.2 §5）：同窗口独立页面，不是抽屉。
// 相对原 SettingsPanel 去掉了：遮罩层、translateX 滑入、inert/aria-hidden、
// useFocusTrap 焦点陷阱、Esc capture 拦截（原为阻止按键泄漏给词典页，页面形态下不存在）、
// 关闭按钮与焦点回归 #settings-trigger、480px 定宽、role="dialog"/aria-modal。
export default function SettingsPage() {
  const [active, setActive] = useState<SectionKey>('general')

  // 「平台权限」分区只在 macOS 存在。**导航项本身也要按平台过滤**——否则 Windows 上
  // 会留下一个点进去一片空白的导航项，与 03 §2.5「Windows 无此分区」相冲突。
  const [platformSupported, setPlatformSupported] = useState(false)
  useEffect(() => {
    void invoke<{ supported: boolean }>('accessibility_status').then(s => setPlatformSupported(s.supported))
  }, [])
  const sections = SECTIONS.filter(s => s.key !== 'platform' || platformSupported)

  // v0.7.3 §6.2：选中态统一到智能视图那套——**阅读面圆角块 + 1px 描边 + 字重 600**，
  // 文字恒为主色。这一条推翻了 v0.5.3 的「暖品牌底 + 2px 品牌色左边条」决定：
  // 三处左侧栏（智能视图 / 设置页 / 复习页）本该长一样，而当时三处是三种实现。
  // 也符合「蓝色收窄」规则——选中由「面 + 描边 + 字重」三件事表达，不需要再叠一层蓝。
  // 描边在未选中态用 transparent 保位：不给的话选中时整列宽度会动 2px、文字左右跳。
  const navStyle = (isActive: boolean): React.CSSProperties => ({
    width: '100%', display: 'block', textAlign: 'left', cursor: 'pointer',
    padding: '8px 10px',
    fontSize: 'var(--text-sm)',
    color: 'var(--color-text-primary)',
    background: isActive ? 'var(--color-surface)' : 'transparent',
    fontWeight: isActive ? 'var(--weight-semibold)' : 'var(--weight-regular)',
    fontFamily: 'var(--font-serif)',
    border: `1px solid ${isActive ? 'var(--color-border-strong)' : 'transparent'}`,
    borderRadius: 'var(--radius-md)',
    transition: 'background-color var(--duration-fast) var(--ease-smooth), border-color var(--duration-fast) var(--ease-smooth)',
  })

  return (
    // data-find-root 供 FindBar 定位当前模块的搜索根（工作台用同名属性区分）
    <div data-find-root="settings" style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
      <nav
        aria-label="设置分区"
        style={{
          width: '160px', flexShrink: 0, background: 'var(--color-canvas)',
          borderRight: '1px solid var(--color-border)', padding: '16px 8px',
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
        {/* 内容列限宽 720px（工作台内容列 v0.7.2 起是 ENTRY_BAND_WIDTH = 900px）：开关行是
            「标签 … flex spacer … 开关」结构，不限宽时窗口越宽、标签与它的开关之间离得越远，两侧留白也随之失控。 */}
        <div style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ maxWidth: SETTINGS_CONTENT_WIDTH, display: 'flex', alignItems: 'center', padding: '20px 24px' }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)' }}>
              {SECTIONS.find(s => s.key === active)!.label}
            </div>
          </div>
        </div>
        <div style={{ maxWidth: SETTINGS_CONTENT_WIDTH, padding: '24px' }}>
          {active === 'general' && (
            <>
              <SectionHeading>外观</SectionHeading>
              <AppearanceSettings />
              <div style={{ marginTop: '24px' }}><SidebarSettings /></div>
              <div style={{ marginTop: '24px' }}><SectionHeading>托盘与窗口</SectionHeading></div>
              <TrayWindowSettings />
            </>
          )}
          {active === 'search' && <SearchSettings />}
          {active === 'review' && <ReviewSettings />}
          {active === 'voice' && <VoiceSettings />}
          {active === 'category' && <CategorySettings />}
          {active === 'platform' && <PlatformSettings />}
          {active === 'about' && (
            <>
              <SectionHeading>版本与更新</SectionHeading>
              <AboutSettings />
              <div style={{ marginTop: '24px' }}><SectionHeading>数据</SectionHeading></div>
              <DataSettings />
            </>
          )}
        </div>
      </div>
    </div>
  )
}