import { useEffect, useState } from 'react'
import { relatedWords } from '../../services/searchService'
import { stripGlossExamples } from '../../lib/wordnetParse'
import type { RelatedWords, RelatedGroup } from '../../providers/wordnet'
import { useViewStore } from '../../stores/viewStore'
import { useWordStore } from '../../stores/wordStore'
import { isWordCollected } from '../../lib/collected'
import Tooltip from '../ui/Tooltip'
import Icon from '../icons'

const LABELS: Record<keyof RelatedWords['groups'], string> = {
  synonyms: '同义词', hypernyms: '上位词', hyponyms: '下位词',
  antonyms: '反义词', partWhole: '整体 · 部分',
  similarTo: '相似词（相近但不同）', alsoSee: '参见', derivatives: '词源相关词',
  entailments: '蕴含', causes: '致使', pertainyms: '派生来源',
  attributes: '属性', verbGroups: '动词组',
}

// 各组关系的 WordNet 官方语义说明（spec §3；全部 13 组都加 ℹ）
const RELATION_DESCRIPTIONS: Record<keyof RelatedWords['groups'], string> = {
  synonyms: '同义词：与该词含义相同或近似的另一组词（WordNet Synset 集合成员），可互换查对释义',
  hypernyms: '上位词：含义更宽泛的类别词（如「苹果」的上位词是「水果」）',
  hyponyms: '下位词：含义更具体的下义词（如「水果」的下位词含「苹果」「香蕉」）',
  antonyms: '反义词：含义相对或相反的词',
  partWhole: '整体 · 部分：整体与部分的组成关系（整体词 ↔ 组成部分词）',
  similarTo: '相似词（相近但不同）：形容词之间相似却不完全同义的近邻',
  alsoSee: '参见：需对照查看的关联词',
  derivatives: '词源相关形式：源自 WordNet 的形态变化词，含同义集合成员，并非全部构词派生',
  entailments: '蕴含：由该动作可必然推断出的动作（如「打鼾」蕴含「睡觉」）',
  causes: '致使：因果对应关系（X 引起 Y 发生）',
  pertainyms: '派生来源：形容/副词所派生的名词来源',
  attributes: '属性：名词属性与描述该属性的形容词之间的对应',
  verbGroups: '动词组：含义相近、可互换而不改变句子真值的动词分组',
}

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
  const collectedWords = useWordStore(s => s.words)

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

  // 胶囊保留整组视觉，但每个单词是独立可点的 token（v0.4.3 §7：单击该词跳转到对应词面板）
  // 组说明不再挂胶囊 Tooltip（v0.5.3 §3.1）：与其内层单词 Tooltip 嵌套会同时弹出、落点重叠。
  // 组标题旁 ℹ 只承载关系类型说明（RELATION_DESCRIPTIONS），一个 key 下可有多组，故每个组另挂自己的 ℹ，
  // 展示该组词集自身的 gloss（g.definition），与单词按钮 Tooltip 互不嵌套、不重叠。
  const chip = (g: RelatedGroup) => (
    <span key={g.words.join('·')} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', maxWidth: '100%',
      fontSize: 13, padding: '3px 11px', borderRadius: 'var(--radius-full)',
      border: '1px solid var(--color-border-strong)', background: 'var(--color-surface)',
      color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)',
    }}>
      {g.words.map((w, i) => (
        <span key={w} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <span style={{ color: 'var(--color-text-tertiary)', opacity: 0.7 }}>·</span>}
          <Tooltip content={`查询「${w}」`} width={220}>
            <button
              type="button"
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
          </Tooltip>
          {isWordCollected(w, collectedWords) && (
            <span aria-label="已收录" title="已收录" style={{ color: 'var(--color-brand)', fontSize: 10, fontWeight: 700 }}>✓</span>
          )}
        </span>
      ))}
      {g.definition && (
        <Tooltip content={stripGlossExamples(g.definition)} width={340}>
          <span role="img" aria-label={`组说明：${g.words.join('、')}`} style={{ display: 'inline-flex', color: 'var(--color-text-tertiary)', cursor: 'help' }}><Icon name="info" size={12} /></span>
        </Tooltip>
      )}
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
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
              {LABELS[key]}
              <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)', marginLeft: 2 }}>{items.length}</span>
              <Tooltip content={RELATION_DESCRIPTIONS[key]} width={300}>
                <span role="img" aria-label="说明" style={{ display: 'inline-flex', color: 'var(--color-text-tertiary)', cursor: 'help' }}><Icon name="info" size={13} /></span>
              </Tooltip>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {shown.map(g => chip(g))}
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
          </div>
        )
      })}

      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', borderTop: '1px dashed var(--color-border)', marginTop: 12, paddingTop: 9 }}>
        点胶囊 → <b style={{ color: 'var(--color-brand)' }}>重新查询该词</b>，网络随词刷新
      </div>
    </div>
  )
}
