import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import DictDetailCard, { type DictDetailCardHandle } from './DictDetailCard'
import WordTitleExtras from './WordTitleExtras'
import SemanticNetwork from './SemanticNetwork'
import TitleChips, { CollinsStars } from './TitleChips'
import WorkbenchNavBar from '../word/WorkbenchNavBar'
import { lookupTitleMeta, lookupWord } from '../../services/searchService'
import { useViewStore } from '../../stores/viewStore'
import { useWordStore } from '../../stores/wordStore'
import { ensureWord } from '../../lib/ensureWord'
import type { MergeFieldInput } from '../../services/wordService'
import type { TitleMeta } from '../../providers/titleMeta'
import type { DictionaryEntry } from '../../types/dictionary'

interface DetailResult {
  source: string
  entries: DictionaryEntry[]
}

interface Props {
  word: string
}

// Tab 栏样式：active 品牌蓝下边框（方案 B mockup）
function tabStyle(active: boolean): CSSProperties {
  return {
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-sm)',
    color: active ? 'var(--color-brand)' : 'var(--color-text-secondary)',
    fontWeight: active ? 'var(--weight-semibold)' : 'var(--weight-medium)',
    padding: '7px 14px',
    border: 'none',
    borderBottom: `2px solid ${active ? 'var(--color-brand)' : 'transparent'}`,
    marginBottom: -1,
    background: 'transparent',
    cursor: 'pointer',
  }
}

// 词典详情视图（D2）：替换右侧区域。导航条返回/Esc 回词编辑视图（Task 5 追加「添加成功回编辑视图」）。
// 词典 | 语义网络 双 Tab；导航条右端「合并添加」聚合全源勾选字段一次合并后跳编辑页（需求 2b 后半）。
export default function DictDetailPanel({ word }: Props) {
  const [results, setResults] = useState<DetailResult[]>([])
  const [loading, setLoading] = useState(true)
  const [lookupError, setLookupError] = useState(false)
  const [mergeError, setMergeError] = useState(false)
  const [tab, setTab] = useState<'dict' | 'network'>('dict')
  // 语义网络徽章计数：SemanticNetwork 经 onCountChange 上报 relatedWords 真实计数
  const [networkCount, setNetworkCount] = useState(0)
  // 标题信息区：TitleMeta + 勾选构建的 strip 合并输入（WordTitleExtras 上报）
  const [meta, setMeta] = useState<TitleMeta | null>(null)
  const [stripInputs, setStripInputs] = useState<MergeFieldInput[]>([])
  const showWorkbench = useViewStore(s => s.showWorkbench)
  const selectWord = useWordStore(s => s.selectWord)
  const mergeWordFields = useWordStore(s => s.mergeWordFields)

  // 每张卡片的受控句柄 + 勾选数（卡片 ref/上报均为可选的，重复合并安全：mergeWordFields 幂等去重）
  const cardRefs = useRef<Record<string, DictDetailCardHandle | null>>({})
  const [selectionCounts, setSelectionCounts] = useState<Record<string, number>>({})
  const handleSelectionChange = useCallback((source: string, count: number) => {
    setSelectionCounts(prev => ({ ...prev, [source]: count }))
  }, [])

  // Controller 裁定：仅标题信息区勾选（无卡片勾选）时合并按钮仍需可见
  const anySelected = results.some(r => (selectionCounts[r.source] ?? 0) > 0) || stripInputs.length > 0

  // 合并添加：聚合全源勾选字段 → 确保词条存在 → 一次合并 → 跳编辑页
  // 规格：addWord/mergeWordFields 任一失败 → 面板顶部错误提示，不跳转（错误在下次 lookup/attempt 时清除）
  const handleMergeAdd = async () => {
    setMergeError(false)
    const inputs: MergeFieldInput[] = []
    for (const r of results) {
      const built = cardRefs.current[r.source]?.buildInputs()
      if (built) inputs.push(...built)
    }
    // 标题信息区（唯一独立条）勾选并入聚合，保证仅 strip 勾选也能合并
    inputs.push(...stripInputs)
    if (inputs.length === 0) return
    const target = await ensureWord(word)
    if (!target) {
      setMergeError(true)
      return
    }
    const ok = await mergeWordFields(target.id, inputs)
    if (!ok) {
      setMergeError(true)
      return
    }
    void selectWord(target.id)
    showWorkbench()
  }

  // 阶段二：精确查询词典详情（两个词典源堆叠）
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLookupError(false)
    setMergeError(false)
    setResults([])
    setSelectionCounts({})
    setNetworkCount(0)
    setMeta(null)
    setStripInputs([])
    lookupWord(word)
      .then(r => { if (!cancelled) setResults(r) })
      .catch(e => { console.error('Word lookup failed:', e); if (!cancelled) setLookupError(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    // 标题信息元数据独立拉取：失败静默置空（badges/音标/词根/领域为增量信息，不影响主查询）
    lookupTitleMeta(word)
      .then(m => { if (!cancelled) setMeta(m) })
      .catch(() => { if (!cancelled) setMeta(null) })
    return () => { cancelled = true }
  }, [word])

  // Esc 回词编辑视图（规格 §3 步骤 4）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') showWorkbench() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showWorkbench])

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--color-surface)' }}>
      <div style={{
        maxWidth: '720px', margin: '0 auto', padding: '24px 16px 48px',
        minHeight: '100%', display: 'flex', flexDirection: 'column',
      }}>
        {/* 导航条（v0.5.3 §3.4）：与工作台同款同位置；左箭头返回工作台、右端合并添加 */}
        <WorkbenchNavBar
          region="dict"
          onBack={showWorkbench}
          onMergeAdd={handleMergeAdd}
          mergeCount={results.reduce((n, r) => n + (selectionCounts[r.source] ?? 0), 0) + stripInputs.length}
          mergeDisabled={!anySelected}
        />

        {/* 单词标题行（v0.5.3 §3.3）：星级紧随单词；徽标与领域标签在右侧两行右对齐 */}
        <div className="flex items-start gap-2 mb-4">
          <span style={{
            fontFamily: 'var(--font-serif)', fontSize: 'var(--text-xl)',
            fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-primary)',
            whiteSpace: 'nowrap',
          }}>
            {word}
          </span>
          <CollinsStars meta={meta} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
            <TitleChips meta={meta} />
          </div>
        </div>

        {/* 标题独立条：音标行/词根行（可勾选合并；徽标/领域在标题行右侧，见 TitleChips；key={word} 换词 remount 重置勾选） */}
        <WordTitleExtras key={word} meta={meta} onInputsChange={setStripInputs} />

        {/* Tab 栏：词典 | 语义网络（语义网络徽章为 relatedWords 真实计数） */}
        <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--color-border)', marginBottom: 16 }}>
          <button type="button" onClick={() => setTab('dict')} style={tabStyle(tab === 'dict')}>词典</button>
          <button type="button" onClick={() => setTab('network')} style={tabStyle(tab === 'network')}>
            语义网络
            <span style={{ marginLeft: 4, padding: '1px 8px', borderRadius: 'var(--radius-full)', fontSize: 11, fontWeight: 'var(--weight-medium)', background: 'var(--color-surface-sunken)', color: 'var(--color-text-secondary)' }}>
              {networkCount}
            </span>
          </button>
        </div>

        {/* 双 Tab 常驻挂载，display 切换隐藏而非卸载，保证卡片勾选跨 Tab 切换保留（Task 4 裁定） */}
        <div style={{ display: tab === 'dict' ? 'block' : 'none' }}>
          {loading ? (
            <div className="flex items-center justify-center py-8" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              加载中…
            </div>
          ) : lookupError ? (
            <div className="flex items-center justify-center py-8" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-accent)' }}>
              词典查询出错，请确认词典文件是否存在
            </div>
          ) : results.length === 0 ? (
            <div className="flex items-center justify-center py-8" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              未找到 &ldquo;{word}&rdquo; 的词典结果
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {results.map(result => (
                  <DictDetailCard
                    key={result.source}
                    word={word}
                    source={result.source}
                    entries={result.entries}
                    ref={el => { cardRefs.current[result.source] = el }}
                    onSelectionChange={handleSelectionChange}
                  />
                ))}
              </div>

              {mergeError && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)', textAlign: 'center', paddingTop: '12px' }}>
                  合并添加失败，请重试
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ display: tab === 'network' ? 'block' : 'none' }}>
          <SemanticNetwork word={word} onCountChange={setNetworkCount} />
        </div>
      </div>
    </div>
  )
}
