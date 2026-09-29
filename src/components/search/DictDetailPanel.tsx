import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import DictDetailCard, { type DictDetailCardHandle } from './DictDetailCard'
import WordTitleExtras from './WordTitleExtras'
import SemanticNetwork from './SemanticNetwork'
import TitleChips, { CollinsStars } from './TitleChips'
import WorkbenchNavBar from '../word/WorkbenchNavBar'
import SpeakButton from '../ui/SpeakButton'
import { lookupTitleMeta, lookupWord } from '../../services/searchService'
import { useViewStore } from '../../stores/viewStore'
import { useWordStore } from '../../stores/wordStore'
import { useReviewOverlayStore } from '../../stores/reviewOverlayStore'
import { ensureWord, isWordInLibrary } from '../../lib/ensureWord'
import { setInitialFamiliarity, type MergeFieldInput, type InitialFamiliarityChoice } from '../../services/wordService'
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

  // 展示态的在库判据实时求值：启动时 loadWords() 未落地的一瞬会短暂多算成「库外」，代价只是多问一次；
  // 反过来若在这里快照，导入后词表变化会看不见。写入端的守卫另在 handleMergeAdd 里现算。
  // 判据与写入守卫的 isWordInLibrary 逐字符相同，但这里必须订阅式：helper 读 getState()
  // 是一次快照，用在 JSX 里词表变化就不会重渲染（R15）。
  const inLibrary = useWordStore(s => s.words.some(w => w.lemma.toLowerCase() === word.toLowerCase()))

  // 初始熟悉度（spec 4.6）：只对库外词问一次，写入随「合并添加」一起发生。
  // 所有权在本面板：卡片级「＋ 添加此词典」也用这个值（卡片自己不留一份状态，两份会漂）。
  const [familiarity, setFamiliarity] = useState<InitialFamiliarityChoice>(1)

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
    // 守卫用的在库判据现算，且必须在 ensureWord 之前取：ensureWord 收录成功会把新词塞进 store，
    // 那时再算，刚收录的库外词也会翻成「已在库」。这里不能沿用渲染期求值的那一份——
    // 面板开着时启动加载的 loadWords() 或设置里的词典导入都可能改写词表，渲染期那份会过期。
    const wordWasInLibrary = isWordInLibrary(word)
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
    // 熟悉度随收录一并写入，但**只在用户被问过时才写**（spec §4.6：单选与本写入同一个条件）。
    // 在库词这里显示的是「已在库」、familiarity 恒为重置默认值 1，无条件写就会把用户当初选的档
    // 覆写成「陌生」——不可撤销，且该值直通 Task 4 三键预填与 Task 6 冷启动档位徽标，
    // 毁的正是本版要合上的那个环（spec §4.7）。失败不阻断收录：字段已入库，缺失只让该词回落 1。
    if (!wordWasInLibrary) {
      const wrote = await setInitialFamiliarity(target.id, familiarity)
      // 熟悉度刚写进库，而 overlay 是 chip 的唯一数据源——不重取它就停在收录前：
      // 新词压根不在里面，chip 会走 ?? 1，把用户刚选的「眼熟」显示成「陌生」（spec §4.7）。
      // 挂在写入点而不是 wordStore 里：叠加层的刷新时机本就与词条内容不同
      // （reviewOverlayStore 的注释），挂进 store 会把两者重新耦上。
      if (wrote) void useReviewOverlayStore.getState().loadOverlay()
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
    setFamiliarity(1)
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
        {/* 导航条（v0.5.3 §3.4）：与工作台同款同位置；左箭头返回工作台、右端合并添加。
            v0.6.5 §4.5 起初始熟悉度三键也收进右端（原先是页面底部的收录区），状态仍归本面板。 */}
        <WorkbenchNavBar
          region="dict"
          onBack={showWorkbench}
          onMergeAdd={handleMergeAdd}
          mergeCount={results.reduce((n, r) => n + (selectionCounts[r.source] ?? 0), 0) + stripInputs.length}
          mergeDisabled={!anySelected}
          familiarity={familiarity}
          onFamiliarityChange={setFamiliarity}
          inLibrary={inLibrary}
        />

        {/* 单词标题行（v0.5.3 §3.3）：星级紧随单词并与单词基线对齐；徽标与领域标签在右侧两行右对齐。
            单词+星级 包一层 items-baseline：跨字体大小/行高比固定 px 偏移稳健；外层 items-start 保留给两行 TitleChips。 */}
        <div className="flex items-start gap-2 mb-4">
          {/* 单词+星级（基准线对齐组）：无 marginLeft:auto，星级紧邻单词右侧 */}
          <div className="flex items-baseline gap-2">
            <span style={{
              fontFamily: 'var(--font-serif)', fontSize: 'var(--text-2xl)',
              fontWeight: 'var(--weight-bold)', color: 'var(--color-text-primary)',
              lineHeight: 1.2, whiteSpace: 'nowrap',
            }}>
              {word}
            </span>
            <CollinsStars meta={meta} />
          </div>
          {/* 发音按钮：所在的外层是 flex items-start（不是 items-baseline），图标靠
              alignSelf:'center' 在行内居中。行高由最高的兄弟决定，而右侧 TitleChips 会渲染
              徽标行 + 领域行两行，故该居中是相对「单词/星级」与「徽标组」之间的中点，不等价于
              对齐单词/星级那一行——两行标签都在时可能看着偏下，待目视确认。
              尺寸 17px：本处没传 size，取 SpeakButton 的默认值（与工作台一致）；
              复习题面那处显式传 16。 */}
          <span style={{ alignSelf: 'center', display: 'inline-flex' }}>
            <SpeakButton text={word} />
          </span>
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
                    familiarity={familiarity}
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
