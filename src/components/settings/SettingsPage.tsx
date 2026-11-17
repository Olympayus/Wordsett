import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { invoke } from '@tauri-apps/api/core'
import SearchSettings from './SearchSettings'
import ReviewSettings from './ReviewSettings'
import VoiceSettings from './VoiceSettings'
import SidebarSettings from './SidebarSettings'
import TrayWindowSettings from './TrayWindowSettings'
import CategorySettings from './CategorySettings'
import LinkSettings from './LinkSettings'
import CollectSettings from './CollectSettings'
import AboutSettings from './AboutSettings'
import DataSettings from './DataSettings'
import PlatformSettings from './PlatformSettings'
import AppearanceSettings from './AppearanceSettings'
import SectionHeading from './SectionHeading'
import Icon from '../icons'
import {
  SETTINGS_SECTIONS,
  visibleSettingsSections,
  type SettingsSection,
  type SettingsSectionKey,
} from '../../lib/mobileSettings'
import { usePlatformClass } from '../../lib/usePlatform'
import { isDesktop } from '../../lib/platform'

/** 内容列限宽 720px（工作台内容列 v0.7.2 起是 ENTRY_BAND_WIDTH = 900px，两者不再等值，
 *  但仍属同一量级）；不限宽时窗口越宽、标签与开关之间离得越远，两侧留白也随之失控。 */
const SETTINGS_CONTENT_WIDTH = 720

/** 手机外壳的视觉常量（spec §4.1 / §10）：顶行 52dp、目录行 44dp 触摸下限、控件 32px。 */
const MOBILE_BAR_HEIGHT = 52
const MOBILE_ROW_HEIGHT = 44
const MOBILE_CONTROL = 32

/** 无边框无底色的图标键（手机设置页顶行的返回）：与 `MobileAppBar` 的 `iconBtn` 同形同尺寸。 */
const mobileIconBtn: CSSProperties = {
  width: MOBILE_CONTROL, height: MOBILE_CONTROL, flexShrink: 0,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', background: 'transparent', borderRadius: 'var(--radius-md)',
  cursor: 'pointer', color: 'var(--color-text-secondary)',
  transition: 'background-color var(--duration-fast) var(--ease-smooth), color var(--duration-fast) var(--ease-smooth)',
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
}

// 设置页（v0.5.2 §5）：同窗口独立页面，不是抽屉。
// 相对原 SettingsPanel 去掉了：遮罩层、translateX 滑入、inert/aria-hidden、
// useFocusTrap 焦点陷阱、Esc capture 拦截（原为阻止按键泄漏给词典页，页面形态下不存在）、
// 关闭按钮与焦点回归 #settings-trigger、480px 定宽、role="dialog"/aria-modal。
//
// Task 9 加 `variant`：手机外壳下**目录 → 子页**两态（顶行左上角的返回键回目录），
// 桌面仍是左栏 + 右内容的双栏。分区列表与「按平台过滤」的判据都取 `lib/mobileSettings.ts`
// 那一份，两套外壳不可能各说各话。
interface Props {
  variant?: 'desktop' | 'mobile'
  /**
   * 手机形态的当前子页（受控用）。`undefined` = 组件自己管；`null` = 目录。
   *
   * 为什么要能受控：安卓返回键由外壳订阅（`MobileShell`），它必须知道「此刻有没有子页」
   * 才能决定是按「回目录」还是退模块。子页状态若只住在组件里，返回键就看不见它，
   * 在子页上按返回会一路退到模块甚至退出应用。
   */
  mobileSection?: SettingsSectionKey | null
  onMobileSectionChange?: (section: SettingsSectionKey | null) => void
}

export default function SettingsPage({ variant = 'desktop', mobileSection: controlledSection, onMobileSectionChange }: Props) {
  const [active, setActive] = useState<SettingsSectionKey>('general')
  // 手机外壳的目录态：`null` = 目录，有值 = 该分区的子页（受控时以 props 为准）。
  const [ownSection, setOwnSection] = useState<SettingsSectionKey | null>(null)
  const mobile = variant === 'mobile'
  const sectionControlled = controlledSection !== undefined
  const mobileSection = sectionControlled ? controlledSection : ownSection
  const setMobileSection = (next: SettingsSectionKey | null) => {
    if (!sectionControlled) setOwnSection(next)
    onMobileSectionChange?.(next)
  }

  // 分区导航按平台过滤：手机外壳直接按形态（`visibleSettingsSections` 去掉 Android 的平台权限），
  // 桌面再叠加 `accessibility_status` 的 `supported`——「平台权限」是 macOS 独有的能力，
  // Windows 上留一个点进去一片空白的导航项，与 03 §2.5「Windows 无此分区」相冲突。
  const platform = usePlatformClass()
  const [platformSupported, setPlatformSupported] = useState(false)
  // 「划词」分区的可见性单独问 `collector_supported`（v0.7.9 Task 16）。**不要复用**
  // `accessibility_status.supported`：Windows 上它恒为 false，会把 Windows 唯一能用的
  // 划词分区一起藏掉——`collector_supported` 正是 Windows / macOS 为真的那个判据。
  const [collectorSupported, setCollectorSupported] = useState(false)
  // 形态切换时把两态的选中项归零：留在桌面选中的分区上，一进手机外壳看到的就是那个子页，
  // 而不是「看起来像没进去的目录」。
  useEffect(() => {
    if (!mobile) return
    setActive('general')
    if (!sectionControlled) setOwnSection(null)
    // 受控时由外壳在离开设置模块时归零（见 `MobileShell`），这里不替它做。
  }, [mobile, sectionControlled])
  useEffect(() => {
    // `accessibility_status` 只在桌面形态有意义：非桌面（Android 手机与平板）目录已按平台
    // 滤掉「平台权限」（`visibleSettingsSections`），再发一次 IPC 只是白跑一趟——而且 Android
    // 上根本没有这个命令，invoke 会以未处理的 rejection 收场。
    if (!isDesktop(platform)) { setPlatformSupported(false); return }
    void invoke<{ supported: boolean }>('accessibility_status').then(s => setPlatformSupported(s.supported))
  }, [platform])
  useEffect(() => {
    // 划词分区同样只在桌面形态存在（非桌面目录已剔除该项）：Android 上 `collector_supported`
    // 不存在，不发。
    if (!isDesktop(platform)) { setCollectorSupported(false); return }
    void invoke<boolean>('collector_supported').then(setCollectorSupported)
  }, [platform])
  const sections: SettingsSection[] = mobile
    ? visibleSettingsSections(platform)
    : SETTINGS_SECTIONS.filter(s =>
        (s.key !== 'platform' || platformSupported) &&
        (s.key !== 'collect' || collectorSupported))

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
    // 与复习区策略栏（StrategyList）和工作区智能视图（SmartViewList）同一套字形：
    // 无衬线 + --text-sm，选中态 600（v0.7.8 收尾；此前三处只有这里还挂着衬线）。
    fontFamily: 'var(--font-sans)',
    border: `1px solid ${isActive ? 'var(--color-border-strong)' : 'transparent'}`,
    borderRadius: 'var(--radius-md)',
    transition: 'background-color var(--duration-fast) var(--ease-smooth), border-color var(--duration-fast) var(--ease-smooth)',
  })

  // 手机子页的内容：**目录里没有桌面左栏**，故子页自己按分区渲染小节。
  // 只有「通用」需要裁剪——托盘与窗口是桌面窗口的概念，手机没有托盘也没有可拖拽窗口，
  // 那一节在手机上是纯粹的噪声；「关于」保留两个小节（版本与更新 / 数据）。
  // 其余分区逐字复用桌面组件（搜索 / 复习 / 语音 / 分类 / 链接 / 平台权限），不复制实现。
  const mobileContent = (key: SettingsSectionKey) => (
    <>
      {key === 'general' && (
        <>
          <SectionHeading>外观</SectionHeading>
          <AppearanceSettings />
          <div style={{ marginTop: '24px' }}><SidebarSettings /></div>
        </>
      )}
      {key === 'search' && <SearchSettings />}
      {key === 'review' && <ReviewSettings />}
      {key === 'voice' && <VoiceSettings variant="mobile" />}
      {key === 'category' && <CategorySettings />}
      {key === 'links' && <LinkSettings />}
      {key === 'platform' && <PlatformSettings />}
      {key === 'about' && (
        <>
          <SectionHeading>版本与更新</SectionHeading>
          {/* v0.7.8：手机与平板都出「检查更新」（非桌面分支读 GitHub latest.json，只通知不下载）——见 AboutSettings。 */}
          <AboutSettings variant="mobile" />
          <div style={{ marginTop: '24px' }}><SectionHeading>数据</SectionHeading></div>
          <DataSettings variant="mobile" />
        </>
      )}
    </>
  )

  // 手机外壳：目录（标题 + 右箭头）→ 子页（顶行左上角返回键 + 该分区内容）。
  // 一屏一态、不做滑入动画（动效只剩底色一档）。安全区由 `paddingTop` 出，与 `MobileSearchPage` 同一条理由。
  if (mobile) {
    return (
      <div
        className="h-full flex flex-col"
        style={{
          background: 'var(--color-canvas)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        {/* 顶行：目录态出标题，子页态出「返回 + 分区名」（spec §4.1「其余页面按各自导航需要出一枚返回」）。
            高度含安全区：`box-sizing: border-box` 下把 `env(…)` 写进 `paddingTop` 会把内容盒从 52 压小、
            让 32px 的控件溢出顶栏压到状态栏上，故写进 `height`（与 `MobileAppBar` 同一配方）。 */}
        <div
          className="shrink-0 flex items-center"
          style={{
            boxSizing: 'content-box',
            height: `${MOBILE_BAR_HEIGHT}px`, padding: '0 8px', gap: 4,
            paddingTop: 'env(safe-area-inset-top)',
            background: 'var(--color-chrome)', borderBottom: '1px solid var(--color-border)',
          }}
        >
          {mobileSection && (
            <button
              type="button"
              aria-label="返回设置"
              onClick={() => setMobileSection(null)}
              style={mobileIconBtn}
            >
              <Icon name="arrow-left" size={18} />
            </button>
          )}
          <div style={{
            flex: '1 1 auto', minWidth: 0, paddingLeft: mobileSection ? 4 : 8,
            fontFamily: 'var(--font-serif)', fontSize: 'var(--text-base)', fontWeight: 'var(--weight-semibold)',
            color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {mobileSection
              ? SETTINGS_SECTIONS.find(s => s.key === mobileSection)!.label
              : '设置'}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto" style={{ minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
          {mobileSection ? (
            <div style={{ padding: '16px 16px 24px' }}>{mobileContent(mobileSection)}</div>
          ) : (
            <div>
              {sections.map(s => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setMobileSection(s.key)}
                  style={{
                    width: '100%', height: `${MOBILE_ROW_HEIGHT}px`, flexShrink: 0,
                    display: 'flex', alignItems: 'center',
                    padding: '0 16px', border: 'none', background: 'transparent',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)',
                    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <span style={{
                    flex: '1 1 auto', minWidth: 0,
                    fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{s.label}</span>
                  {/* 右箭头是「这一行能进去」的唯一提示（蓝色收窄规则：蓝不做通用可点提示，
                      这里也不用蓝，取三级灰）。图标库已有 `chevron-right`，不新增图形。 */}
                  <span style={{ color: 'var(--color-text-tertiary)', display: 'flex', flexShrink: 0 }}>
                    <Icon name="chevron-right" size={16} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

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
              {SETTINGS_SECTIONS.find(s => s.key === active)!.label}
            </div>
          </div>
        </div>
        <div style={{ maxWidth: SETTINGS_CONTENT_WIDTH, padding: '24px' }}>
          {active === 'general' && (
            <>
              <SectionHeading>外观</SectionHeading>
              <AppearanceSettings />
              <div style={{ marginTop: '24px' }}><SidebarSettings /></div>
              {/* 托盘与窗口是桌面窗口的概念：平板复用桌面外壳，但既没有托盘、也没有可拖拽窗口，
                  故标题与组件一起不渲染（标题在这里，组件不自画标题）。 */}
              {isDesktop(platform) && (
                <>
                  <div style={{ marginTop: '24px' }}><SectionHeading>托盘与窗口</SectionHeading></div>
                  <TrayWindowSettings />
                </>
              )}
            </>
          )}
          {active === 'search' && <SearchSettings />}
          {active === 'review' && <ReviewSettings />}
          {active === 'voice' && <VoiceSettings variant={isDesktop(platform) ? 'desktop' : 'mobile'} />}
          {active === 'category' && <CategorySettings />}
          {active === 'links' && <LinkSettings />}
          {active === 'collect' && <CollectSettings />}
          {active === 'platform' && <PlatformSettings />}
          {active === 'about' && (
            <>
              <SectionHeading>版本与更新</SectionHeading>
              <AboutSettings />
              <div style={{ marginTop: '24px' }}><SectionHeading>数据</SectionHeading></div>
              <DataSettings variant={isDesktop(platform) ? 'desktop' : 'mobile'} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
