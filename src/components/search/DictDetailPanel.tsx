import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import DictDetailCard, { type DictDetailCardHandle } from './DictDetailCard'
import WordTitleExtras from './WordTitleExtras'
import SemanticNetwork from './SemanticNetwork'
import TitleChips, { CollinsStars } from './TitleChips'
import WorkbenchNavBar from '../word/WorkbenchNavBar'
import EntryBand from '../entry/EntryBand'
import { lookupTitleMeta, lookupWord } from '../../services/searchService'
import { useViewStore } from '../../stores/viewStore'
import { useWordStore } from '../../stores/wordStore'
import { useReviewOverlayStore } from '../../stores/reviewOverlayStore'
import { useCategoryStore } from '../../stores/categoryStore'
import { ensureWord, isWordInLibrary } from '../../lib/ensureWord'
import { ENTRY_BAND_WIDTH, ENTRY_COLUMN_PADDING } from '../../lib/layout'
import { setInitialFamiliarity, type MergeFieldInput, type InitialFamiliarityChoice } from '../../services/wordService'
import type { TitleMeta } from '../../providers/titleMeta'
import type { DictionaryField } from '../../types/dictionary'

interface Props {
  word: string
}

// 页签样式：凸起页签（圆角顶、白底、压住下面那道 2px 线），色值走 token（借 word/TabBar 的视觉）。
function tabStyle(active: boolean): CSSProperties {
  return {
    position: 'relative', padding: '7px 18px', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
    borderRadius: '8px 8px 0 0', zIndex: 1, border: 'none', fontFamily: 'var(--font-sans)',
    background: active ? 'var(--color-surface)' : 'transparent',
    color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
    fontWeight: active ? 600 : 400,
    ...(active ? { border: '1px solid var(--color-border)', borderBottom: 'none', marginBottom: -2 } : {}),
  }
}

// 非活动页签的 hover：起底色并转主色（与 FreeScopeTabs / TabBar 同款；活动页签不动）。
// v0.7.2 §6 规则 2：转的是主文字色，不再是品牌蓝。
const tabHoverOn = (active: boolean) => (e: React.MouseEvent<HTMLButtonElement>) => {
  if (active) return
  // 页签条的底是 --color-surface-sunken（:203），故 hover 走凹陷档，与工作台 TabBar 同值。
  e.currentTarget.style.background = 'var(--color-surface-hover-recessed)'
  e.currentTarget.style.color = 'var(--color-text-primary)'
}
const tabHoverOff = (active: boolean) => (e: React.MouseEvent<HTMLButtonElement>) => {
  if (active) return
  e.currentTarget.style.background = 'transparent'
  e.currentTarget.style.color = 'var(--color-text-secondary)'
}

// 词典详情视图（D2）：替换右侧区域。导航条返回/Esc 回词编辑视图（Task 5 追加「添加成功回编辑视图」）。
// 词典 | 语义网络 双 Tab；导航条右端「合并添加」聚合全源勾选字段一次合并后跳编辑页（需求 2b 后半）。
// v0.7.2 §8.3：整页改用展示原语——头带（EntryBand）→ 凸起页签 → 正文流（SenseFlow）→ 一行细动作。
export default function DictDetailPanel({ word }: Props) {
  const [fields, setFields] = useState<DictionaryField[]>([])
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
  // 判据与写入守卫 isWordInLibrary 的出处同一份，但这里必须订阅式：helper 读 getState()
  // 是一次快照，用在 JSX 里词表变化就不会重渲染（R15）。
  const inLibrary = useWordStore(s => s.words.some(w => w.lemma.toLowerCase() === word.toLowerCase()))

  // 初始熟悉度（spec 4.6）：只对库外词问一次，写入随「合并添加」一起发生。
  // 所有权在本面板：只此一处状态，别处不留副本（两份会漂）。
  const [familiarity, setFamiliarity] = useState<InitialFamiliarityChoice>(1)

  // 受控句柄 + 勾选数（卡片 ref/上报均为可选的，重复合并安全：mergeWordFields 幂等去重）
  const cardRef = useRef<DictDetailCardHandle | null>(null)
  // 卡片勾选数上报（导航条「添加 · N 项」的计数与 disabled 判据）。单卡后不再按源索引。
  const [selectionCount, setSelectionCount] = useState(0)
  const handleSelectionChange = useCallback((count: number) => setSelectionCount(count), [])

  // Controller 裁定：仅标题信息区勾选（无卡片勾选）时合并按钮仍需可见
  const anySelected = selectionCount > 0 || stripInputs.length > 0

  // 合并添加：聚合全源勾选字段 → 确保词条存在 → 一次合并 → 跳编辑页
  // 规格：addWord/mergeWordFields 任一失败 → 面板顶部错误提示，不跳转（错误在下次 lookup/attempt 时清除）
  // categoryId 只有「＋」路径传：主按钮不传，走的就是与改前逐字相同的那条路。
  const handleMergeAdd = async (categoryId?: string) => {
    setMergeError(false)
    // 单卡 + 独立的标题条：两处勾选就是全部输入
    const inputs: MergeFieldInput[] = cardRef.current?.buildInputs() ?? []
    inputs.push(...stripInputs)
    if (inputs.length === 0) return
    // 守卫用的在库判据现算，且必须在 ensureWord 之前取：ensureWord 收录成功会把新词塞进 store，
    // 那时再算，刚收录的库外词也会翻成「已在库」。这里不能沿用渲染期求值的那一份——
    // 面板开着时启动加载的 loadWords() 或设置里的词典导入都可能改写词表，渲染期那份会过期。
    const wordWasInLibrary = isWordInLibrary(word)
    const target = await ensureWord(word, categoryId ? { skipDefaultCategory: true } : undefined)
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
    // 「＋」路径：合并成功后再把这个词归入所选分类。主按钮不传 categoryId，走的就是
    // ensureWord → addWord 里 assignDefaultToWord 那条路（默认分类只写一次，见上）；
    // ＋ 路径则在 addWord 阶段就跳过了默认分类，这里补上用户真正选的那个。
    // 放在 mergeWordFields 的成功分支之后、跳转之前：合并失败时提前 return，
    // 不会给一个没合并成功的词落分类。词已在库时这条路径同样有效——那正是本版新增的能力。
    if (categoryId) {
      await useCategoryStore.getState().assignMany([target.id], categoryId)
    }
    void selectWord(target.id)
    showWorkbench()
  }

  // 阶段二：精确查询词典详情（两源合流成一棵字段树，节点带来源标记）
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLookupError(false)
    setMergeError(false)
    setFields([])
    setSelectionCount(0)
    setNetworkCount(0)
    setMeta(null)
    setStripInputs([])
    setFamiliarity(1)
    lookupWord(word)
      .then(r => { if (!cancelled) setFields(r) })
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
        maxWidth: `${ENTRY_BAND_WIDTH}px`, margin: '0 auto', padding: ENTRY_COLUMN_PADDING,
        minHeight: '100%', display: 'flex', flexDirection: 'column',
      }}>
        {/* 导航条（v0.5.3 §3.4）：与工作台同款同位置；左箭头返回工作台、右端合并添加。
            v0.6.5 §4.5 起初始熟悉度三键也收进右端（原先是页面底部的收录区），状态仍归本面板。
            v0.7.2 §8.3：返回页分支加一条面包屑（词典 › 词），不再有别的浮动装饰。 */}
        <WorkbenchNavBar
          region="dict"
          onBack={showWorkbench}
          onMergeAdd={handleMergeAdd}
          mergeCount={selectionCount + stripInputs.length}
          mergeDisabled={!anySelected}
          familiarity={familiarity}
          onFamiliarityChange={setFamiliarity}
          inLibrary={inLibrary}
          breadcrumb={<>词典 › <b style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>{word}</b></>}
        />

        {/* 词条头带（v0.7.2 §8.3）：单词 / 喇叭由 EntryBand 出；星级与徽标 / 领域标签并进头带
            （EntryBand 没有这两项的槽位，故走 rows 的第一行）；音标 / 词根由 WordTitleExtras 交出
            （可单独勾选合并，勾选框保留）。返回页不看顽固词与记忆强度，两个都不传。 */}
        <EntryBand
          headword={word}
          rows={
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginTop: '7px' }}>
                <CollinsStars meta={meta} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
                  <TitleChips meta={meta} />
                </div>
              </div>
              <WordTitleExtras key={word} meta={meta} onInputsChange={setStripInputs} />
            </>
          }
        />

        {/* Tab 栏：词典 | 语义网络（凸起页签；语义网络徽章为 relatedWords 真实计数）。
            条面底 = --color-surface-sunken：**刻意偏离设计稿**——设计稿 .tabs 用 --paper（showcase-v2:172），
            而 --paper = #F9F8F5 正是我们的 --color-canvas；两页（此处与工作台 TabBar）在代码里都走 sunken。
            分支基线时 sunken 是更暗的一档（#EFECE5），条面确实凹陷，v0.7.2 的新档位只是压缩了这一步、
            未撤销意图——勿改回 canvas，否则白页签落白页、hover 的凹陷值（tabHoverOn）也失去依据。 */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, padding: '4px 0 0', background: 'var(--color-surface-sunken)', borderBottom: '2px solid var(--color-border-strong)', marginTop: 12, marginBottom: 16 }}>
          <button type="button" onClick={() => setTab('dict')} style={tabStyle(tab === 'dict')}
            onMouseEnter={tabHoverOn(tab === 'dict')} onMouseLeave={tabHoverOff(tab === 'dict')}>词典</button>
          <button type="button" onClick={() => setTab('network')} style={tabStyle(tab === 'network')}
            onMouseEnter={tabHoverOn(tab === 'network')} onMouseLeave={tabHoverOff(tab === 'network')}>
            语义网络
            {/* 计数按设计稿 .tab .cnt（showcase-v2:175）：11px 纯文本 / 三级字色 / 左距 5px，
                无底、无内边距、无圆角。改前的胶囊既偏离设计，又把 --color-chrome 用到了
                标题栏 / 活动栏以外的用途（spec §1.1）。 */}
            <span style={{ marginLeft: 5, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
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
          ) : fields.length === 0 ? (
            <div className="flex items-center justify-center py-8" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              未找到 &ldquo;{word}&rdquo; 的词典结果
            </div>
          ) : (
            <>
              <DictDetailCard
                ref={cardRef}
                word={word}
                fields={fields}
                onSelectionChange={handleSelectionChange}
              />

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
