import { useRef, type CSSProperties } from 'react'
import type { WordWithPreview } from '../../types/word'
import type { Category } from '../../types/category'
import type { SidebarMode } from '../../lib/sidebar'
import { formatPhonetic } from '../../lib/phonetic'
import { useReviewOverlayStore } from '../../stores/reviewOverlayStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { isLeech } from '../../lib/review/leech'
import LeechBadge from '../ui/LeechBadge'
import CheckBox from '../ui/CheckBox'

interface Props {
  word: WordWithPreview
  categories: Category[]   // 该单词的分类（展开胶囊 / 收起色圈）
  selected: boolean
  collapsed: boolean       // 侧边栏收起态
  mode: SidebarMode
  /**
   * 选择模式下点击的含义变了：不再切换当前词条，而是切换勾选。
   * 键盘激活（Enter / Space）与鼠标点击走同一个回调，所以入参是两种事件的并集——
   * 两个事件都只被读 `shiftKey`，键盘激活不能因此失效。写成 `React.MouseEvent` 会让
   * onKeyDown 里的 `onClick(e)` 编译不过（KeyboardEvent 缺 clientX 等成员），用 as 强转
   * 则等于把类型系统的告警按掉，两者都不选。
   */
  onClick: (e: React.MouseEvent | React.KeyboardEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
  selectionMode: boolean
  checked: boolean
}

function hexToRgb(hex: string): string {
  const m = hex.replace('#', '')
  const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16)
  return `${r}, ${g}, ${b}`
}

export default function WordListItem({ word, categories, selected, collapsed, mode, onClick, onContextMenu, selectionMode, checked }: Props) {
  const collapsedDots = categories.slice(0, 3)   // 收起态色圈限 3 个：匹配 COLLAPSED_CHROME_ALPHABET 的 3 色圈宽度（27px）
  const lineRef = useRef<HTMLDivElement>(null)
  // 顽固词徽标数据（v0.6.4；出题依据 03 §3.2）。词表是虚拟滚动的，只按本行 wordId 查表，
  // 不发 IPC——与 categoryStore 的 wordCategoryMap 同一做法。
  // 收起态（collapsed）下**不渲染徽标**：那里只剩单词名与分类色圈，没有位置，塞进去会把行压变形。
  const overlay = useReviewOverlayStore(s => s.overlay[word.id])
  const leechThreshold = useSettingsStore(s => s.review.leechThreshold)
  const isLeechRow = !collapsed && !!overlay && isLeech(overlay.maxLapses, leechThreshold)

  const containerStyle: CSSProperties = {
    display: 'flex',
    alignItems: collapsed ? 'center' : 'flex-start',
    gap: '10px',
    padding: collapsed ? (mode === 'alphabet' ? '6px 10px' : '6px 8px') : '8px 12px',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    position: 'relative',
    background: checked ? 'var(--color-brand-soft)' : (selected ? 'var(--color-surface)' : 'transparent'),
    transition: 'background-color var(--duration-fast) var(--ease-smooth), transform var(--duration-fast) var(--ease-smooth)',
    justifyContent: collapsed && mode === 'category' ? 'center' : undefined,
  }

  return (
    <div
      role="button"
      tabIndex={0}
      data-word-id={word.id}
      className="group"
      onClick={onClick}
      onContextMenu={e => { e.preventDefault(); onContextMenu?.(e) }}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e) } }}
      style={containerStyle}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement
        if (!selected) el.style.background = 'var(--color-surface-hover)'
        el.style.transform = collapsed ? 'translateX(0)' : 'translateX(2px)'
        if (!selected && lineRef.current) {
          lineRef.current.style.background = 'var(--color-text-secondary)'
          lineRef.current.style.opacity = '1'
        }
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement
        el.style.background = selected ? 'var(--color-surface)' : 'transparent'
        el.style.transform = 'translateX(0)'
        if (lineRef.current) {
          lineRef.current.style.background = selected ? 'var(--color-brand)' : 'var(--color-border)'
          lineRef.current.style.opacity = selected ? '1' : '0.5'
        }
      }}
    >
      {selectionMode && (
        // 外层 span 吞掉冒泡并转交给父级的 onClick——勾选框自己是 <button>，
        // 点它会同时触发自己的 onClick 与行的 onClick，不拦就会勾两次（等于没勾）。
        // CheckBox 的 onChange 传空函数是刻意的：它是受控组件，状态真源在父级的选中集里，
        // 切换只走这一条路径。
        <span
          style={{ display: 'inline-flex', flexShrink: 0, alignSelf: collapsed ? 'center' : 'flex-start', marginTop: collapsed ? 0 : 2 }}
          onClick={e => { e.stopPropagation(); onClick(e) }}
        >
          <CheckBox checked={checked} onChange={() => {}} label={word.lemma} />
        </span>
      )}

      {/* 编织线（规格 §4.4）：默认 3px 50% 透明，悬停 text-secondary 实色，选中 brand 4px */}
      <div ref={lineRef} style={{
        width: selected ? '4px' : '3px',
        alignSelf: 'stretch',
        background: selected ? 'var(--color-brand)' : 'var(--color-border)',
        borderRadius: 'var(--radius-full)',
        opacity: selected ? 1 : 0.5,
        flexShrink: 0,
        transition: 'background-color var(--duration-fast) var(--ease-smooth), opacity var(--duration-fast) var(--ease-smooth)',
      }} />

      {collapsed ? (
        <>
          {/* 收起态单词名（字母模式左对齐 + 色圈；分类模式居中） */}
          <div style={{
            flex: 1, minWidth: 0,
            fontFamily: 'var(--font-serif)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)',
            color: 'var(--color-text-primary)', lineHeight: 1.3,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            textAlign: mode === 'category' ? 'center' : 'left',
          }}>
            {word.lemma}
          </div>
          {mode === 'alphabet' && collapsedDots.length > 0 && (
            <div style={{ display: 'flex', gap: '3px', flexShrink: 0, alignItems: 'center' }}>
              {collapsedDots.map(c => (
                <span key={c.id} style={{ width: '7px', height: '7px', borderRadius: '50%', background: c.color }} />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* 行 1：单词 */}
            <div style={{
              fontFamily: 'var(--font-serif)', fontSize: 'var(--text-base)', fontWeight: 'var(--weight-semibold)',
              color: 'var(--color-text-primary)', lineHeight: 1.3,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {word.lemma}
            </div>
            {/* 行 2：左 音标·词性（可换行）｜右 分类胶囊（右对齐）；词性与音标同为纯文本，无边框 */}
            <div style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginTop: '3px',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', flexWrap: 'wrap', minWidth: 0 }}>
                {word.phonetic && (
                  <span style={{
                    fontFamily: 'var(--font-phonetic)', fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-secondary)', whiteSpace: 'nowrap',
                  }}>
                    {formatPhonetic(word.phonetic)}
                  </span>
                )}
                {word.phonetic && (word.partOfSpeechTags?.length ?? 0) > 0 && (
                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: '12px', flexShrink: 0 }}>·</span>
                )}
                {(word.partOfSpeechTags ?? []).map((p, i) => (
                  <span key={i} style={{
                    fontFamily: 'var(--font-phonetic)', fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-secondary)', whiteSpace: 'nowrap',
                  }}>
                    {p}
                  </span>
                ))}
              </div>
              {(categories.length > 0 || isLeechRow) && (
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
                  {categories.map(c => (
                    <span key={c.id} style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px', height: '18px', padding: '0 8px',
                      borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)',
                      background: `rgba(${hexToRgb(c.color)}, 0.12)`, color: c.color, whiteSpace: 'nowrap',
                    }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                      {c.name}
                    </span>
                  ))}
                  {isLeechRow && <LeechBadge count={overlay!.maxLapses} />}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
