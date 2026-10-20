import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useViewStore } from '../../stores/viewStore'
import { useWordStore } from '../../stores/wordStore'
import { useSearchSuggestions } from '../../services/useSearchSuggestions'
import { searchRows } from '../../lib/mobileSearch'
import { isChineseQuery } from '../../lib/chineseSearch'
import Icon from '../icons'
import ClearButton from '../ui/ClearButton'

/**
 * 手机搜索页（Task 7，spec §4.5）：顶行「返回 + 输入 + 清除」，下面一条单列建议列表。
 *
 * - 输入框**自动聚焦**（进页面即出软键盘，省掉一次点击）；`inputMode="search"` /
 *   `autoComplete="off"` / `autoCapitalize="off"` 三件齐备——手机键盘因此出「搜索」确认键，
 *   且不会把地址栏那类联想与首字母大写带进搜索。
 * - **无表单**：`<input>` 不包 `<form>`，Enter / 键盘「搜索」键不会触发表单提交（也就没有整页刷新）。
 * - 列表行由 `lib/mobileSearch.ts` 的 `searchRows` 算（纯函数，`mobileSearch.test.ts` 钉住）：
 *   词面 + 中文释义（中文查询路径才有）+ 已收录标识，**不分组、不加「词典」标记**。
 * - 点行走 `openDictFromSearch(lemma)`：保持 search 模块、切词典详情视图，返回键（Task 8 的
 *   移动端详情）经 `showSearchResults` 回到本页。
 * - 建议取数走 `useSearchSuggestions`——与桌面顶栏 `TopBar` **同一份**（300ms 防抖 / 中文分流 /
 *   输入法合成期守卫），两个界面不可能分家。
 * - 软键盘：内容区是 `flex: 1 + minHeight: 0`，列表在键盘弹起（视口收缩）时跟着缩短而不是被
 *   盖住；左右内边距走 `safe-area-inset-*`，刘海 / 挖孔屏下不贴边。
 *
 * 视觉只取既有 token；蓝只用于「当前 / 激活」这类状态，本页没有任何蓝。触屏上不做 hover 底色
 * （手机没有 hover，那套只服务桌面）：行的反馈是点按本身，与底栏 / 词条条同一判断。
 */

/** 顶行高度（spec §4.1 的顶栏 52dp）。不含状态栏——安全区另加。 */
const BAR_HEIGHT = 52
/** 输入框高度：与手机顶栏控件同为 32px（Task 5 的 CONTROL），命中区由整行高度保证。 */
const INPUT_HEIGHT = 32
/** 建议行高：44dp 是触摸目标的下限（spec §10），行内两行文字仍读得开。 */
const ROW_HEIGHT = 44

/** 无边框无底色的图标键（返回）：与 `MobileAppBar` 的 `iconBtn` 同形同尺寸。 */
const iconBtn: CSSProperties = {
  width: 32, height: 32, flexShrink: 0,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', background: 'transparent', borderRadius: 'var(--radius-md)',
  cursor: 'pointer', color: 'var(--color-text-secondary)',
  transition: 'background-color var(--duration-fast) var(--ease-smooth), color var(--duration-fast) var(--ease-smooth)',
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
}

export default function MobileSearchPage() {
  const closeSearch = useViewStore(s => s.closeSearch)
  const openDictFromSearch = useViewStore(s => s.openDictFromSearch)
  const showSearchResults = useViewStore(s => s.showSearchResults)
  const libraryIndex = useWordStore(s => s.libraryIndex)

  const [query, setQuery] = useState('')
  const { suggestions, glosses, isComposing, setComposing } = useSearchSuggestions(query)
  const inputRef = useRef<HTMLInputElement>(null)

  // 进页面即聚焦（软键盘随页面一起弹出，用户直接就能打字）。挂载一次即可：
  // 放在 effect 里而不是 autoFocus 属性——后者在模块切换复用这个组件时不一定重触发。
  useEffect(() => { inputRef.current?.focus() }, [])

  // 从词典详情返回搜索列表（Task 8 的移动端详情顶栏那枚返回键走这里）。
  // 与 `DictDetailPanel` 的 Esc 返回同一约定：window 级、模块对得上才接管，
  // 这样搜索 → 词典 → 搜索结果这条链上的 Esc 不会误关整个搜索模块。
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (useViewStore.getState().activeModule !== 'search') return
      if (useViewStore.getState().activeView === 'dict') showSearchResults()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showSearchResults])

  const rows = searchRows(suggestions, libraryIndex, glosses)

  // 清除：清空输入并把焦点还给输入框（与桌面顶栏的 ClearButton 同一行为）。
  const clearQuery = useCallback(() => { setQuery(''); inputRef.current?.focus() }, [])

  return (
    <div
      className="h-full flex flex-col"
      style={{
        background: 'var(--color-canvas)',
        // 左右安全区：刘海 / 挖孔屏下输入框与列表不贴屏幕边缘
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {/* 顶行：返回 + 输入 + 清除（无表单，Enter 不提交） */}
      <div
        className="shrink-0 flex items-center"
        style={{
          height: `${BAR_HEIGHT}px`, gap: 8, padding: '0 8px',
          background: 'var(--color-chrome)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <button type="button" title="返回" aria-label="返回" onClick={closeSearch} style={iconBtn}>
          <Icon name="arrow-left" size={18} />
        </button>

        <div style={{
          flex: '1 1 auto', minWidth: 0, height: `${INPUT_HEIGHT}px`,
          display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-full)',
        }}>
          <span style={{ color: 'var(--color-text-tertiary)', display: 'flex' }}>
            <Icon name="search" size={16} />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            onKeyDown={e => {
              // 中文查询 / 输入法合成确认键的 Enter 不跳转（与桌面顶栏逐字一致的守卫）：
              // 合成中的 Enter 是候选确认，中文词直接跳转会误触。
              // 没有 form，故这里既不提交也不跳转——列表是即时的，没有「提交搜索」这个动作。
              if (e.key === 'Enter' && (isComposing || isChineseQuery(query.trim()))) return
            }}
            placeholder="输入单词或中文释义"
            aria-label="搜索单词"
            // 手机键盘：出「搜索」确认键、不带浏览器联想、不自动首字母大写
            inputMode="search"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            style={{
              flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-sans)',
            }}
          />
          <ClearButton visible={query.trim().length > 0} onClick={clearQuery} />
        </div>
      </div>

      {/* 建议列表：单列、即时跟随输入（无「搜索」按钮）。`flex:1 + minHeight:0` 让它在
          软键盘弹起、视口收缩时真的变短——否则列表下半截被键盘盖住且滚不到。 */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ minHeight: 0, WebkitOverflowScrolling: 'touch' }}
      >
        {rows.length === 0 ? (
          <div style={{
            padding: '24px 16px', textAlign: 'center',
            fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)',
            fontFamily: 'var(--font-sans)',
          }}>
            {query.trim() ? '没有匹配的单词' : '输入单词或中文释义开始搜索'}
          </div>
        ) : rows.map(row => (
          <button
            key={row.lemma}
            type="button"
            onClick={() => openDictFromSearch(row.lemma)}
            style={{
              width: '100%', height: `${ROW_HEIGHT}px`, flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '0 16px', border: 'none', background: 'transparent',
              cursor: 'pointer', textAlign: 'left',
              fontFamily: 'var(--font-sans)',
              touchAction: 'manipulation',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {/* 词面 + 中文释义（释义缺失时第二行整行不渲染，词面仍居中在同一行高里） */}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{
                display: 'block', fontSize: 15, fontFamily: 'var(--font-serif)',
                color: 'var(--color-text-primary)', overflow: 'hidden',
                textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {row.lemma}
              </span>
              {row.gloss && (
                <span style={{
                  display: 'block', marginTop: 2, fontSize: 12,
                  color: 'var(--color-text-tertiary)', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {row.gloss}
                </span>
              )}
            </span>
            {/* 「已收录」是内容的数据标记（§6 规则 3：蓝不做数据标记），用中性二级灰。 */}
            {row.collected && (
              <span style={{
                marginLeft: 'auto', flexShrink: 0, fontSize: 11,
                color: 'var(--color-text-secondary)', fontWeight: 500,
              }}>✓ {row.collected}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
