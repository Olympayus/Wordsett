import { useState, useRef, useEffect, useCallback } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import SearchSuggestions from '../search/SearchSuggestions'
import { searchLemmas, searchChinese } from '../../services/searchService'
import { isChineseQuery } from '../../lib/chineseSearch'
import { useViewStore } from '../../stores/viewStore'
import { useUpdaterStore } from '../../stores/updaterStore'
import { useWordStore } from '../../stores/wordStore'
import { useClickOutside } from '../../lib/useClickOutside'
import { SIDEBAR_EXPANDED_WIDTH } from '../../lib/sidebar'
import { ACTIVITY_RAIL_WIDTH } from './ActivityRail'
import Icon from '../icons'

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
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searchError, setSearchError] = useState(false)
  const [zhGlosses, setZhGlosses] = useState<Record<string, string>>({})
  const [focused, setFocused] = useState(false)
  const [isComposing, setIsComposing] = useState(false)
  const showDict = useViewStore(s => s.showDict)
  const showWorkbench = useViewStore(s => s.showWorkbench)
  const hasUpdate = useUpdaterStore(s => s.hasUpdateBadge)
  const badgeVersion = useUpdaterStore(s => s.badgeVersion)
  const openDialog = useUpdaterStore(s => s.openDialog)
  const words = useWordStore(s => s.words)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // 建议下拉点外关闭：用 document 级 pointerdown 监听（既有 useClickOutside 模式）。
  // 之前用全屏遮罩 onClick，但遮罩位于 data-tauri-drag-region 顶栏内，mousedown 被窗口拖拽吞掉、click 不触发，导致点空白不关闭。
  const searchRef = useRef<HTMLDivElement>(null)
  const closeSuggestions = useCallback(() => setShowSuggestions(false), [])
  useClickOutside(searchRef, closeSuggestions, showSuggestions)

  // 窗口最大化状态同步（自绘标题栏需要，最大/还原图标切换）
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false
    appWindow.isMaximized().then(m => { if (!cancelled) setIsMaximized(m) })
    appWindow.onResized(async () => {
      const m = await appWindow.isMaximized()
      if (!cancelled) setIsMaximized(m)
    }).then(fn => { unlisten = fn }).catch(console.error)
    return () => { cancelled = true; unlisten?.() }
  }, [appWindow])

  const toggleMaximize = () => { void appWindow.toggleMaximize() }

  // 阶段一：防抖搜索建议（300ms）；CJK 输入分发 searchChinese，输入法合成期（isComposing）跳过搜索
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([])
      setShowSuggestions(false)
      setZhGlosses({})
      setSearchError(false)
      return
    }
    if (isComposing) return  // 输入法合成中不搜索，compositionend 会触发本 effect 重跑
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        // 中文路径取 hits（单词 + 释义）；英文路径仅单词。分开取而非共用三元：
        // TS 不会在 if(isChineseQuery) 内收窄 ChineseSearchHit[] | string[] 联合
        let words: string[]
        let glosses: Record<string, string>
        if (isChineseQuery(query)) {
          const hits = await searchChinese(query)
          words = hits.map(h => h.word)
          glosses = Object.fromEntries(hits.map(h => [h.word, h.translation] as const))
        } else {
          words = await searchLemmas(query)
          glosses = {}
        }
        setSuggestions(words)
        setZhGlosses(glosses)
        setShowSuggestions(words.length > 0)
        setSelectedIndex(-1)
        setSearchError(false)
      } catch (e) {
        console.error('Search failed:', e)
        setSearchError(true)
      }
    }, 300)
    return () => clearTimeout(timer.current)
  }, [query, isComposing])

  // 选中建议或回车 → 右侧区域切换为词典详情视图（D2：替换显示，非顶栏下方展开）
  const handleSelectWord = useCallback((word: string) => {
    setQuery(word)
    setShowSuggestions(false)
    showDict(word)
  }, [showDict])

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
      data-tauri-drag-region
      onDoubleClick={(e) => {
        const t = e.target as HTMLElement
        if (t.closest('input, button')) return
        toggleMaximize()
      }}
      style={{
        height: '48px', display: 'flex', alignItems: 'center', gap: '12px',
        padding: `0 8px 0 ${LOGO_LEFT_PADDING}px`,
        // 顶栏必须浮在页面内容之上：搜索建议下拉会垂出 48px 的 header 进入内容行，
        // 而工作台的吸顶导航条同为 --z-sticky（20）、且在 DOM 中更靠后，等值并列时后者胜出会盖住下拉。
        // 故顶栏取 --z-overlay（30）：高于页内吸顶条（20）与页内下拉（10），仍低于模态（40）与 FindBar。
        position: 'relative', zIndex: 'var(--z-overlay)',
        background: 'var(--color-canvas)', borderBottom: '1px solid var(--color-border)',
      }}
    >
      {/* 左：Logo 32×32（规格 §3：圆角 radius-md，渐变 brand→#3A5A8A），点击回词编辑视图 */}
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <button
          type="button"
          aria-label="Wordsett 首页"
          title="Wordsett"
          onClick={showWorkbench}
          style={{
            width: '32px', height: '32px', flexShrink: 0, cursor: 'pointer', border: 'none',
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, var(--color-brand) 0%, #3A5A8A 100%)',
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
      </div>

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
            background: 'var(--color-surface)',
            border: `1px solid ${focused ? 'var(--color-brand)' : 'var(--color-border)'}`,
            borderRadius: 'var(--radius-full)',   // Chrome 式胶囊圆角（原 radius-lg）
            transition: 'border-color var(--duration-fast) var(--ease-smooth)',
          }}>
            <span style={{ color: 'var(--color-text-tertiary)', display: 'flex' }}>
              <Icon name="search" size={16} />
            </span>
            <input
              value={query}
              onChange={e => { setQuery(e.target.value); setSelectedIndex(-1) }}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              onFocus={() => { setFocused(true); if (suggestions.length > 0) setShowSuggestions(true) }}
              onBlur={() => setFocused(false)}
              onKeyDown={handleKeyDown}
              placeholder="添加或查询单词..."
              style={{
                flex: 1, border: 'none', outline: 'none', background: 'transparent',
                fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-sans)',
              }}
            />
          </div>

          {showSuggestions && (
            <SearchSuggestions
              suggestions={suggestions}
              selectedIndex={selectedIndex}
              onSelect={handleSelectWord}
              onHover={i => setSelectedIndex(i)}
              query={query}
              collectedWords={words}
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

      {/* 右：更新徽标 + 窗口控制（最小化 / 最大化⇄还原 / 关闭） */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
        {/* 更新徽标：静默检查发现新版时点亮，点击打开更新弹窗 */}
        {hasUpdate && (
          <button
            type="button"
            title="有可用更新，点击查看"
            onClick={openDialog}
            style={{
              height: 26, marginRight: 6, padding: '0 10px', border: 'none', borderRadius: 'var(--radius-full)',
              background: 'var(--color-brand-soft)', color: 'var(--color-brand)', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--font-sans)',
            }}
          >
            有更新{badgeVersion ? ` v${badgeVersion}` : ''}
          </button>
        )}

        <button type="button" title="最小化" aria-label="最小化" onClick={() => void appWindow.minimize()}
          style={{ width: '30px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', outline: 'none', background: 'transparent', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
          <Icon name="minimize" size={14} />
        </button>
        <button type="button" title={isMaximized ? '还原' : '最大化'} aria-label={isMaximized ? '还原' : '最大化'} onClick={toggleMaximize}
          style={{ width: '30px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', outline: 'none', background: 'transparent', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
          <Icon name={isMaximized ? 'restore' : 'maximize'} size={14} />
        </button>
        <button type="button" title="关闭" aria-label="关闭" onClick={() => void appWindow.close()}
          style={{ width: '30px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', outline: 'none', background: 'transparent', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-danger)'; e.currentTarget.style.color = 'white' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)' }}>
          <Icon name="close" size={14} />
        </button>
      </div>
    </header>
  )
}
