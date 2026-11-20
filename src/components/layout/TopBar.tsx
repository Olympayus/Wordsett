import { useState, useRef, useEffect, useCallback } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import SearchSuggestions from '../search/SearchSuggestions'
import { useViewStore } from '../../stores/viewStore'
import { useUpdaterStore } from '../../stores/updaterStore'
import { useMobileUpdateStore } from '../../stores/mobileUpdateStore'
import { useUiStore } from '../../stores/uiStore'
import { useWordStore } from '../../stores/wordStore'
import { useClickOutside } from '../../lib/useClickOutside'
import { usePlatformClass } from '../../lib/usePlatform'
import { isDesktop } from '../../lib/platform'
import { hasCoarsePointer } from '../../lib/pointer'
import { touchInputStyles } from '../../lib/touchInput'
import { openExternalUrl, RELEASES_URL } from '../../lib/openExternal'
import { useSearchSuggestions } from '../../services/useSearchSuggestions'
import { isChineseQuery } from '../../lib/chineseSearch'
import { SIDEBAR_EXPANDED_WIDTH } from '../../lib/sidebar'
import { TOPBAR_HEIGHT, TOPBAR_HEIGHT_TOUCH } from '../../lib/layout'
import { ACTIVITY_RAIL_WIDTH } from './ActivityRail'
import DueBadge from './DueBadge'
import Icon from '../icons'
import ClearButton from '../ui/ClearButton'
import Tooltip from '../ui/Tooltip'

// 搜索框几何：可用宽度两侧各扣「活动栏 + 展开侧栏 + 边距」，保证搜索框与建议下拉都不侵入侧栏。
const SEARCH_EDGE_MARGIN = 12
const SEARCH_MIN_WIDTH = 320
const SEARCH_LEFT_INSET = ACTIVITY_RAIL_WIDTH + SIDEBAR_EXPANDED_WIDTH + SEARCH_EDGE_MARGIN  // 358

// Logo 水平居中对齐活动栏图标（v0.5.3 §4.1 第 17 条）。活动栏 <nav> 是内容行第一列、
// 贴在窗口 x=0，alignItems:'center'（列向 flex 的交叉轴即水平）把 32px 图标按钮水平居中。
// 关键：46px 是 border-box 宽（Tailwind preflight 对 * 设 box-sizing: border-box），
// 其中含 ActivityRail <nav> 的 borderRight: 1px 且左右 padding 为 0，
// 故实际居中宽度是 46 - 1 = 45px → 图标中心 x = 45/2 = 22.5px。
// Logo 也是 32px 宽，中心 x = 左内边距 + 16，令两者相等：
// 左内边距 = 46/2 - 1/2 - 16 = (46 - 1 - 32) / 2 = 6.5px。
const ACTIVITY_RAIL_BORDER = 1  // 须与 ActivityRail <nav> 的 borderRight 同步
const LOGO_LEFT_PADDING = (ACTIVITY_RAIL_WIDTH - ACTIVITY_RAIL_BORDER - 32) / 2  // 6.5

// 全局顶栏（规格 §3）：Logo 32×32 / 主搜索框 32px / 设置按钮；建议下拉 → 词典详情视图（D2）
// 自绘标题栏（Task 15）：header 为拖拽区 + 内置窗口控制；搜索框绝对居中、胶囊圆角
export default function TopBar() {
  const appWindow = getCurrentWindow()
  const [isMaximized, setIsMaximized] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [focused, setFocused] = useState(false)
  // 建议词、释义、输入法合成态、取数失败标志位都归这条 hook（与手机搜索页同一份，见其文件头）。
  // 这里只留「下拉开合 / 键盘选中 / 焦点」这类纯界面状态。
  const { suggestions, glosses: zhGlosses, isComposing, setComposing, failed } = useSearchSuggestions(query)
  const showDict = useViewStore(s => s.showDict)
  const showWorkbench = useViewStore(s => s.showWorkbench)
  // 更新徽标按平台选数据源：桌面走签名更新器，Android 平板（它复用桌面外壳、挂的是
  // 这个 TopBar）走 `useMobileUpdateStore`。手机外壳有自己的 `MobileTabBar` 圆点，不经过这里。
  const platform = usePlatformClass()
  // 窗口按钮与拖拽区只在桌面存在（v0.7.10）：平板复用这套外壳但没有可拖的窗口，
  // 手机外壳则不渲染 TopBar。三处（拖拽属性 / 双击最大化 / 三枚按钮）共用这一个判据。
  const desktopOnly = isDesktop(platform)
  const android = !desktopOnly
  // 触摸输入档（v0.7.10 §7.4）：本组件只服务桌面外壳（平板复用同一套），没有 `touch` prop，
  // 故按主指针判断——平板上搜索框 16px / 40px，桌面鼠标环境为空对象、样式逐字不变。
  const touch = hasCoarsePointer()
  const touchStyle = touchInputStyles(touch)
  const desktopHasUpdate = useUpdaterStore(s => s.hasUpdateBadge)
  const desktopBadgeVersion = useUpdaterStore(s => s.badgeVersion)
  const openDialog = useUpdaterStore(s => s.openDialog)
  const mobileHasUpdate = useMobileUpdateStore(s => s.hasUpdateBadge)
  const mobileBadgeVersion = useMobileUpdateStore(s => s.badgeVersion)
  const hasUpdate = android ? mobileHasUpdate : desktopHasUpdate
  const badgeVersion = android ? mobileBadgeVersion : desktopBadgeVersion
  // 建议列表的模块标识读**词库索引**（v0.7.5 Task 13，工作区 ∪ 储藏库），
  // 不再拿当前模块的词表充数——那会把储藏库的词显示成未收录。
  const libraryIndex = useWordStore(s => s.libraryIndex)

  // 建议下拉点外关闭：用 document 级 pointerdown 监听（既有 useClickOutside 模式）。
  // 之前用全屏遮罩 onClick，但遮罩位于 data-tauri-drag-region 顶栏内，mousedown 被窗口拖拽吞掉、click 不触发，导致点空白不关闭。
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const closeSuggestions = useCallback(() => setShowSuggestions(false), [])
  useClickOutside(searchRef, closeSuggestions, showSuggestions)

  // 窗口最大化状态同步（自绘标题栏需要，最大/还原图标切换）。
  // 非桌面（平板复用本顶栏）早退：iOS / Android 上没有可最大化的窗口，这些窗口 API 会报错。
  useEffect(() => {
    if (!desktopOnly) return
    let unlisten: (() => void) | undefined
    let cancelled = false
    appWindow.isMaximized().then(m => { if (!cancelled) setIsMaximized(m) })
    appWindow.onResized(async () => {
      const m = await appWindow.isMaximized()
      if (!cancelled) setIsMaximized(m)
    }).then(fn => { unlisten = fn }).catch(console.error)
    return () => { cancelled = true; unlisten?.() }
  }, [appWindow, desktopOnly])

  // 非桌面不调窗口 API（双击最大化 / 控制键共用）：iOS 上这条 IPC 没有对应实现，会报错。
  const toggleMaximize = () => {
    if (!desktopOnly) return
    void appWindow.toggleMaximize()
  }

  // 选中建议或回车 → 右侧区域切换为词典详情视图（D2：替换显示，非顶栏下方展开）
  const handleSelectWord = useCallback((word: string) => {
    setQuery(word)
    setShowSuggestions(false)
    showDict(word)
  }, [showDict])

  // 更新徽标点击：桌面打开签名更新弹窗；Android 平板先确认，再把系统浏览器送到
  // GitHub Releases——手机版只通知、不下载、不安装。
  const handleUpdateClick = async () => {
    if (!android) { openDialog(); return }
    const ok = await useUiStore.getState().confirm({
      title: badgeVersion ? `发现新版本 v${badgeVersion}` : '发现新版本',
      message: '手机版通过 GitHub Releases 手动下载安装。',
      confirmLabel: '前往 GitHub 下载',
      cancelLabel: '稍后',
    })
    if (!ok) return
    await openExternalUrl(RELEASES_URL).catch(e => console.error('[mobile] 打开下载页失败：', e))
  }

  // 取数结果 → 下拉开合 / 键盘选中 / 错误条。归并放在 `useEffect` 而不是渲染期：
  // 清空输入框时也要顺带把下拉收掉，而那是同一次渲染里的 `suggestions` 变化，只有 effect
  // 能覆盖到（渲染期 setState 会在每次按键时同步重挂顶栏，代价落在最热的输入路径上）。
  //
  // `searchError` 那半边**逐字保留抽 hook 前的实现**（`console.error` + `setSearchError(true)`）：
  // 词典文件缺失时桌面要点亮错误条，这条路径本任务不改行为。副作用是失败时选中行不复位——
  // 那是既有行为，一样不动。
  useEffect(() => {
    if (failed) { setSearchError(true); return }
    if (suggestions.length === 0) {
      setShowSuggestions(false)
      setSearchError(false)
      return
    }
    setShowSuggestions(true)
    setSelectedIndex(-1)
    setSearchError(false)
  }, [suggestions, failed])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!showSuggestions || suggestions.length === 0) return
      e.preventDefault()
      if (e.key === 'ArrowDown') setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1))
      else setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      // 中文查询 / 输入法合成确认键的 Enter 不跳转：合成中的 Enter 是候选确认，中文词直接跳转会误触
      if (isComposing || isChineseQuery(query.trim())) return
      // 回车：优先选中的建议，否则以输入词直接查询词典（规格 §3 步骤 3）
      const word = selectedIndex >= 0 ? suggestions[selectedIndex] : query.trim()
      if (word) { e.preventDefault(); handleSelectWord(word) }
    }
  }

  return (
    <header
      {...(desktopOnly ? { 'data-tauri-drag-region': true } : {})}
      onDoubleClick={(e) => {
        if (!desktopOnly) return
        const t = e.target as HTMLElement
        if (t.closest('input, button')) return
        toggleMaximize()
      }}
      style={{
        height: `${touch ? TOPBAR_HEIGHT_TOUCH : TOPBAR_HEIGHT}px`, display: 'flex', alignItems: 'center', gap: '12px',
        padding: `0 8px 0 ${LOGO_LEFT_PADDING}px`,
        // 顶栏必须浮在页面内容之上：搜索建议下拉会垂出 48px 的 header 进入内容行，
        // 而工作台的吸顶导航条同为 --z-sticky（20）、且在 DOM 中更靠后，等值并列时后者胜出会盖住下拉。
        // 故顶栏取 --z-overlay（30）：高于页内吸顶条（20）与页内下拉（10），仍低于模态（40）与 FindBar。
        position: 'relative', zIndex: 'var(--z-overlay)',
        // 标题栏取 --color-chrome（spec §1.1 的「标题栏 / 活动栏」档，全站最凹）。
        background: 'var(--color-chrome)', borderBottom: '1px solid var(--color-border)',
      }}
    >
      {/* 左：Logo 32×32（规格 §3：圆角 radius-md），点击回词编辑视图。
          v0.7.2 §6：删掉品牌蓝的手写加深渐变（原 linear-gradient(brand, #3A5A8A)），
          改单色品牌蓝底 + 白字（§1.4「删掉装饰性渐变」，#3A5A8A 随之消失）。 */}
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <Tooltip content="Wordsett 首页">
          <button
            type="button"
            aria-label="Wordsett 首页"
            data-session-guard="home:workbench"
            onClick={showWorkbench}
            style={{
              width: '32px', height: '32px', flexShrink: 0, cursor: 'pointer', border: 'none',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-brand)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
            }}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
              <circle cx="8" cy="6" r="1.5" fill="white" stroke="white" />
              <circle cx="16" cy="12" r="1.5" fill="white" stroke="white" />
              <circle cx="8" cy="18" r="1.5" fill="white" stroke="white" />
            </svg>
          </button>
        </Tooltip>
      </div>

      {/* 待复习提示（v0.6.3 条目 5）：logo 右侧。count = 0 或设置关掉时组件自己返回 null，
          故这里无需条件渲染。 */}
      <DueBadge />

      {/* 中：搜索框默认按窗口中心绝对居中；宽度与左缘下限都保证它（及其下拉）不侵入展开侧栏。
          原先只按 (侧边栏 300 + 16) × 2 减宽，漏掉了活动栏 46px，且靠 50% 居中——
          1400px 窗口下左缘落在 316px，而侧栏右缘在 46 + 300 = 346，于是下拉会盖住侧栏。
          现在可用宽度按「活动栏 + 展开侧栏 + 12px 边距」两侧扣（358 × 2），
          左缘再加 max(…, 358 + 半最小宽) 兜底，窄窗口下也不会越过侧栏。 */}
      <div
        style={{
          position: 'absolute', top: '50%',
          left: `max(50%, ${SEARCH_LEFT_INSET + SEARCH_MIN_WIDTH / 2}px)`,
          transform: 'translate(-50%, -50%)',
          width: `min(960px, max(${SEARCH_MIN_WIDTH}px, calc(100vw - ${SEARCH_LEFT_INSET * 2}px)))`,
        }}
      >
        <div className="relative" ref={searchRef}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px', height: '32px', padding: '0 12px',
            // 触摸档（平板）：高度交给输入框的 minHeight 40，顶栏同步加高到
            // TOPBAR_HEIGHT_TOUCH（56）——否则 42px 的胶囊在 48px 顶栏里上下只剩 2–3px，
            // 几乎贴住下方分割线（用户 2026-11-18 反馈）。
            ...(touch ? { height: 'auto' } : null),
            background: 'var(--color-surface)',
            border: `1px solid ${focused ? 'var(--color-brand)' : 'var(--color-border)'}`,
            borderRadius: 'var(--radius-full)',   // Chrome 式胶囊圆角（原 radius-lg）
            transition: 'border-color var(--duration-fast) var(--ease-smooth)',
          }}>
            <span style={{ color: 'var(--color-text-tertiary)', display: 'flex' }}>
              <Icon name="search" size={16} />
            </span>
            <input
              ref={inputRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setSelectedIndex(-1) }}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={() => setComposing(false)}
              onFocus={() => { setFocused(true); if (suggestions.length > 0) setShowSuggestions(true) }}
              onBlur={() => setFocused(false)}
              onKeyDown={handleKeyDown}
              placeholder="添加或查询单词..."
              style={{
                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-sans)',
                // 触摸档（v0.7.10 §7.4）：16px 防 iOS 聚焦缩放、minHeight 40；横向留白由
                // 外层胶囊的 12px 给出，内层归零。
                ...touchStyle, ...(touch ? { padding: 0 } : null),
              }}
            />
            <ClearButton
              visible={query.trim().length > 0}
              onClick={() => { setQuery(''); inputRef.current?.focus() }}
            />
          </div>

          {showSuggestions && (
            <SearchSuggestions
              suggestions={suggestions}
              selectedIndex={selectedIndex}
              onSelect={handleSelectWord}
              onHover={i => setSelectedIndex(i)}
              query={query}
              libraryIndex={libraryIndex}
              glosses={zhGlosses}
            />
          )}
          {searchError && !showSuggestions && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
              padding: '8px 12px', fontSize: 'var(--text-xs)', color: 'var(--color-accent)',
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)', zIndex: 'var(--z-dropdown)',
            }}>
              词典搜索出错，请确认词典文件是否存在
            </div>
          )}
        </div>
      </div>

      {/* 右：更新徽标 + 窗口控制（最小化 / 最大化⇄还原 / 关闭，仅桌面） */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
        {/* 更新徽标：静默检查发现新版时点亮。桌面点击打开更新弹窗；Android 平板点击后
            确认并跳转 GitHub Releases（见 handleUpdateClick）。 */}
        {hasUpdate && (
          <button
            type="button"
            onClick={() => { void handleUpdateClick() }}
            style={{
              height: 26, marginRight: 6, padding: '0 10px', border: 'none', borderRadius: 'var(--radius-full)',
              background: 'var(--color-brand-soft)', color: 'var(--color-brand)', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-sans)',
            }}
          >
            有更新{badgeVersion ? ` v${badgeVersion}` : ''}
          </button>
        )}

        {desktopOnly && (
          <>
            <Tooltip content="最小化" placement="below">
              <button type="button" aria-label="最小化" onClick={() => void appWindow.minimize()}
                style={{ width: '30px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', outline: 'none', background: 'transparent', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover-recessed)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <Icon name="minimize" size={14} />
              </button>
            </Tooltip>
            <Tooltip content={isMaximized ? '还原' : '最大化'} placement="below">
              <button type="button" aria-label={isMaximized ? '还原' : '最大化'} onClick={toggleMaximize}
                style={{ width: '30px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', outline: 'none', background: 'transparent', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover-recessed)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                <Icon name={isMaximized ? 'restore' : 'maximize'} size={14} />
              </button>
            </Tooltip>
            <Tooltip content="关闭" placement="below">
              <button type="button" aria-label="关闭" onClick={() => void appWindow.close()}
                style={{ width: '30px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', outline: 'none', background: 'transparent', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-danger)'; e.currentTarget.style.color = 'white' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}>
                <Icon name="close" size={14} />
              </button>
            </Tooltip>
          </>
        )}
      </div>
    </header>
  )
}
