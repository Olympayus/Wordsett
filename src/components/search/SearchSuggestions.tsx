import type { Word } from '../../types/word'
import { isWordCollected } from '../../lib/collected'

interface Props {
  suggestions: string[]
  selectedIndex: number
  onSelect: (word: string) => void
  onHover: (index: number) => void
  query: string
  collectedWords?: Pick<Word, 'normalizedLemma'>[]
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

export default function SearchSuggestions({ suggestions, selectedIndex, onSelect, onHover, query, collectedWords = [], glosses = {} }: Props) {
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
      {suggestions.map((word, i) => (
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
          {isWordCollected(word, collectedWords) && (
            <span title="已收录" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-brand)', fontWeight: 500, fontFamily: 'var(--font-sans)' }}>✓ 已收录</span>
          )}
        </button>
      ))}
    </div>
  )
}
