import type { WordLocation } from '../../types/word'
import { collectedLabel, libraryLocationIn } from '../../lib/collected'

/** 缺省索引：调用方没传时视为空库（组件保持无 store 依赖）。 */
const EMPTY_LIBRARY_INDEX: ReadonlyMap<string, WordLocation> = new Map()

interface Props {
  suggestions: string[]
  selectedIndex: number
  onSelect: (word: string) => void
  onHover: (index: number) => void
  query: string
  /** 词库索引（v0.7.5 Task 13，工作区 ∪ 储藏库）：键已归一化，经 `libraryLocationIn` 查。 */
  libraryIndex?: ReadonlyMap<string, WordLocation>
  glosses?: Record<string, string>
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <span key={i} style={{ color: 'var(--color-accent)', fontWeight: 500 }}>{part}</span>
      : part
  )
}

export default function SearchSuggestions({ suggestions, selectedIndex, onSelect, onHover, query, libraryIndex = EMPTY_LIBRARY_INDEX, glosses = {} }: Props) {
  if (suggestions.length === 0) return null

  return (
    <div
      className="absolute top-full left-0 right-0 mt-1 max-h-80 overflow-y-auto"
      style={{
        zIndex: 'var(--z-dropdown)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-overlay)',
      }}
    >
      <div style={{
        padding: '8px 16px',
        fontSize: '12px',
        color: 'var(--color-text-secondary)',
        fontWeight: 500,
        fontFamily: 'var(--font-sans)',
      }}>
        单词建议
      </div>
      {suggestions.map((word, i) => {
        // 模块标识（v0.7.5 Task 13）：按词库索引分「已在工作台 / 已在储藏库」，
        // 不再只看当前模块的词表——那套会把储藏库的词当成库外。
        const collected = collectedLabel(libraryLocationIn(libraryIndex, word))
        return (
          <button
            key={word}
            onClick={() => onSelect(word)}
            onMouseEnter={() => onHover(i)}
            style={{
              width: '100%',
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              border: 'none',
              background: i === selectedIndex ? 'var(--color-surface-hover)' : 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'var(--font-serif)',
              fontSize: '15px',
              color: 'var(--color-text-primary)',
              transition: 'background-color var(--duration-fast) var(--ease-smooth)',
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              {highlightText(word, query)}
              {(glosses[word] ?? '') && (
                <span style={{
                  display: 'block', marginTop: 2, fontSize: 12, color: 'var(--color-text-tertiary)',
                  fontFamily: 'var(--font-sans)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {highlightText(glosses[word]!, query)}
                </span>
              )}
            </span>
            {collected && (
              // 「已收录」是内容的数据标记（§6 规则 3：蓝不做数据标记），用中性二级灰。
              <span title={collected} style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 500, fontFamily: 'var(--font-sans)' }}>✓ {collected}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
