import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { relatedWords } from '../../services/searchService'
import { stripGlossExamples } from '../../lib/wordnetParse'
import type { RelatedWords, RelatedGroup } from '../../providers/wordnet'
import { useViewStore } from '../../stores/viewStore'

const LABELS: Record<keyof RelatedWords['groups'], string> = {
  synonyms: '同义词', hypernyms: '上位词', hyponyms: '下位词',
  antonyms: '反义词', partWhole: '整体 · 部分',
  similarTo: '相似词（相近但不同）', alsoSee: '参见', derivatives: '词源相关词',
}

// 词源相关词组的小字说明（v0.4.3 §6：WordNet 词源相关形式 ≠ 构词派生）
const DERIVATIVES_NOTE = '源自 WordNet 词源相关形式，含同义集合成员，并非全部构词派生'

interface Props {
  word: string
  // 语义网络徽章计数（Task 4 裁定：真实 relatedWords 计数替换静态 24），数据加载后上报
  onCountChange?: (count: number) => void
}

// 语义网络视图（D2 第二 Tab）：加载 relatedWords，渲染上位词路径 + 各关系分组胶囊，
// 点胶囊 showDict 重查该词，网络随词刷新。
export default function SemanticNetwork({ word, onCountChange }: Props) {
  const [data, setData] = useState<RelatedWords | null>(null)
  const [error, setError] = useState(false)
  // 每组是否展开显示全部（默认折叠，只显示前 9 个）；按组标签 key
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const showDict = useViewStore(s => s.showDict)

  // 换词取消过期请求；数据就绪后上报徽章计数（全组词条总数）；失败进入 error 态（如 wordnet.db 未生成）
  useEffect(() => {
    let cancelled = false
    setData(null)
    setError(false)
    relatedWords(word)
      .then(d => {
        if (cancelled) return
        setData(d)
        onCountChange?.(Object.values(d.groups).reduce((sum, g) => sum + g.length, 0))
      })
      .catch(e => {
        console.error(e)
        if (!cancelled) setError(true)
      })
    return () => { cancelled = true }
  }, [word, onCountChange])

  if (error) {
    return <div style={{ fontSize: 13, color: 'var(--color-danger)', padding: '20px 0' }}>语义网络数据加载失败，请先构建本地词典库（npm run build:dictionaries）</div>
  }

  if (!data) {
    return <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', padding: '20px 0' }}>加载中…</div>
  }

  // 相似词组簇释义常驻 caption（两行截断，hover 看完整 gloss）
  const CAPTION_STYLE: CSSProperties = {
    fontSize: 12,
    color: 'var(--color-text-tertiary)',
    lineHeight: 1.45,
    maxWidth: '100%',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  }

  // 胶囊保留整组视觉，但每个单词是独立可点的 token（v0.4.3 §7：单击该词跳转到对应词面板）
  const chip = (g: RelatedGroup) => (
    <span
      key={g.words.join('·')}
      title={g.definition}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 13, padding: '3px 11px', borderRadius: 'var(--radius-full)',
        border: '1px solid var(--color-border-strong)', background: 'var(--color-surface)',
        color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)',
      }}
    >
      {g.words.map((w, i) => (
        <span key={w} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <span style={{ color: 'var(--color-text-tertiary)', opacity: 0.7 }}>·</span>}
          <button
            type="button"
            title={`查询「${w}」`}
            onClick={() => showDict(w)}
            style={{
              border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
              fontSize: 13, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)',
              borderRadius: 'var(--radius-sm)',
              transition: 'color var(--duration-fast) var(--ease-smooth), text-decoration-color var(--duration-fast) var(--ease-smooth)',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-brand)'; e.currentTarget.style.textDecoration = 'underline'; e.currentTarget.style.textUnderlineOffset = '2px' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-primary)'; e.currentTarget.style.textDecoration = 'none' }}
          >
            {w}
          </button>
        </span>
      ))}
    </span>
  )

  const entries = Object.entries(data.groups) as Array<[keyof RelatedWords['groups'], RelatedGroup[]]>

  return (
    <div>
      {data.path.length > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', fontSize: 12,
          color: 'var(--color-text-secondary)', background: 'var(--color-brand-soft)',
          borderRadius: 'var(--radius-md)', padding: '6px 10px', marginBottom: 14,
        }}>
          {data.path.map((p, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <span style={{ color: 'var(--color-text-tertiary)' }}>›</span>}
              <b style={{ color: i === data.path.length - 1 ? 'var(--color-brand)' : 'var(--color-text-primary)', fontWeight: 600 }}>{p}</b>
            </span>
          ))}
        </div>
      )}

      {entries.map(([key, items]) => {
        // 空组整组不渲染（含反义词：无反义词时不显示占位文案）
        if (items.length === 0) return null
        const isExpanded = expanded[key]
        const shown = isExpanded ? items : items.slice(0, 9)
        return (
          <div key={key} style={{ marginBottom: 13 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {LABELS[key]} <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)', marginLeft: 4 }}>{items.length}</span>
            </div>
            <div style={
              key === 'similarTo'
                ? { display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }
                : { display: 'flex', flexWrap: 'wrap', gap: 6 }
            }>
              {shown.map(g => key === 'similarTo'
                ? (
                  <div key={g.words.join('·')} style={{ maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {chip(g)}
                    {g.definition && (
                      <span title={g.definition} style={CAPTION_STYLE}>{stripGlossExamples(g.definition)}</span>
                    )}
                  </div>
                )
                : chip(g))}
              {items.length > 9 && (
                <button
                  type="button"
                  onClick={() => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))}
                  style={{ fontSize: 12, color: 'var(--color-brand)', padding: '3px 9px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                >
                  {isExpanded ? '收起' : `+${items.length - 9} 更多`}
                </button>
              )}
            </div>
            {key === 'derivatives' && (
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4, lineHeight: 1.5 }}>
                {DERIVATIVES_NOTE}
              </div>
            )}
          </div>
        )
      })}

      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', borderTop: '1px dashed var(--color-border)', marginTop: 12, paddingTop: 9 }}>
        点胶囊 → <b style={{ color: 'var(--color-brand)' }}>重新查询该词</b>，网络随词刷新
      </div>
    </div>
  )
}
