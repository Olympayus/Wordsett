import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import DictDetailCard, { type DictDetailCardHandle, type CollapseState } from './DictDetailCard'
import WordTitleExtras from './WordTitleExtras'
import SemanticNetwork from './SemanticNetwork'
import TitleChips, { CollinsStars } from './TitleChips'
import WorkbenchNavBar from '../word/WorkbenchNavBar'
import EntryBand from '../entry/EntryBand'
import SpeakButton from '../ui/SpeakButton'
import { lookupTitleMeta, lookupWord } from '../../services/searchService'
import { useViewStore } from '../../stores/viewStore'
import { useWordStore } from '../../stores/wordStore'
import { useReviewOverlayStore } from '../../stores/reviewOverlayStore'
import { useCategoryStore } from '../../stores/categoryStore'
import { ensureWord, isWordInLibrary } from '../../lib/ensureWord'
import { libraryLocationIn } from '../../lib/collected'
import { countAllDefinitions } from '../../lib/dictPlan'
import { ENTRY_BAND_WIDTH, ENTRY_COLUMN_PADDING, TAB_ITEM_PADDING_X, TAB_STRIP_PADDING } from '../../lib/layout'
import { setInitialFamiliarity, type MergeFieldInput, type InitialFamiliarityChoice } from '../../services/wordService'
import type { TitleMeta } from '../../providers/titleMeta'
import type { DictionaryField } from '../../types/dictionary'

interface Props {
  word: string
}

// 页签样式：凸起页签（圆角顶、白底、压住下面那道 2px 线），色值走 token（借 word/TabBar 的视觉）。
// 内边距取 layout.ts 的 TAB_ITEM_PADDING_X（v0.7.3 尾段 §4.1 / D18），与工作区 TabBar 同一份出处。
function tabStyle(active: boolean): CSSProperties {
  return {
    position: 'relative', padding: TAB_ITEM_PADDING_X, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
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

  // 展示态的在库判据（v0.7.5 Task 13）：实时订阅**词库索引**（工作区 ∪ 储藏库），
  // 与写入守卫 isWordInLibrary 同源；判定逻辑走 collected.ts 的 `libraryLocationIn`。
  // 启动时 loadWords() 未落地的一瞬索引为空，会短暂把库内词当成库外，代价只是多问一次；
  // 反过来若在这里快照，导入 / 移动后词表变化就看不见。
  // 订阅式是必须的：helper 读 getState() 是一次快照，用在 JSX 里词表变化就不会重渲染（R15）。
  const libraryLocation = useWordStore(s => libraryLocationIn(s.libraryIndex, word))

  // 初始熟悉度（spec 4.6）：只对库外词问一次，写入随「合并添加」一起发生。
  // 所有权在本面板：只此一处状态，别处不留副本（两份会漂）。
  const [familiarity, setFamiliarity] = useState<InitialFamiliarityChoice>(1)

  // 受控句柄 + 勾选数（卡片 ref/上报均为可选的，重复合并安全：mergeWordFields 幂等去重）
  const cardRef = useRef<DictDetailCardHandle | null>(null)
  // 卡片勾选数上报（导航条「添加 · N 项」的计数与 disabled 判据）。单卡后不再按源索引。
  const [selectionCount, setSelectionCount] = useState(0)
  const handleSelectionChange = useCallback((count: number) => setSelectionCount(count), [])
  // 折叠态上报（v0.7.2 修复 8）：页签条右端那枚「全部收起 / 全部展开」按它显隐与换文案。
  // 折叠态本身住在卡片里（collapsedKeys 由字段树推出），这里只留一个镜像，按钮经 ref 回调卡片。
  const [collapseState, setCollapseState] = useState<CollapseState>({ hasContainers: false, allCollapsed: false })
  const handleCollapseStateChange = useCallback((s: CollapseState) => setCollapseState(s), [])

  // 「共 N 条释义」（v0.7.2 修复 4）：计数已移进页签条的「词典」页签里，故改在面板这层算。
  // 口径与卡片原先逐字相同——countAllDefinitions 走合流后的字段树，不随 displayFields 过滤。
  const totalDefs = countAllDefinitions(fields)
  const definitionCount = totalDefs.cn + totalDefs.en

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
    // 那时再算，刚收录的库外词也会翻成「已在工作台」。这里不能沿用渲染期求值的那一份——
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
    // 在库词这里显示的是「已在工作台 / 已在储藏库」、familiarity 恒为重置默认值 1，无条件写就会把用户当初选的档
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
    setCollapseState({ hasContainers: false, allCollapsed: false })
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
      {/* 导航条（v0.5.3 §3.4）：与工作台同款同位置；左箭头返回工作台、右端合并添加。
          v0.6.5 §4.5 起初始熟悉度三键也收进右端（原先是页面底部的收录区），状态仍归本面板。
          v0.7.2 §8.3：返回页分支加一条面包屑（词典 › 词），不再有别的浮动装饰。
          v0.7.2 修复 3「导航条应该贯穿整个右侧区域」：移出 900 内容列，横贯整个右侧区域——
          与工作区 / 复习区同一结构（导航条在内容列之外、sticky 贴在滚动区上缘）。
          v0.7.2 二轮：**wrapper 不再垫 ENTRY_COLUMN_PADDING_X**。先前垫的 24px 把导航条
          自己的 borderBottom 一并内缩，分割线因此左右各短 24px、顶不到屏幕边缘（用户原话：
          「分割线在左右两侧并没有顶到左边和右边，而是留空了一段」）。wrapper 通栏、NavBar
          自身另持 14px 内边距（WorkbenchNavBar.tsx 的 `padding:'0 14px'`），条内内容宽度不变、不横跳；
          结构与复习区 ReviewModule.tsx:152 一致（sticky 块无水平内边距）。 */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 'var(--z-sticky)',
        background: 'var(--color-chrome)',
      }}>
        <WorkbenchNavBar
          region="dict"
          onBack={showWorkbench}
          onMergeAdd={handleMergeAdd}
          mergeCount={selectionCount + stripInputs.length}
          // 词在库里（无论工作台还是储藏库）一律不给添加（v0.7.5 spec §2.7）：
          // 储藏库的词被 ensureWord 命中原行后也不会搬回工作台，添加只会把字段写进
          // 一个用户看不见的词条；故与工作台同档禁用，标识文案由导航条按模块给出。
          mergeDisabled={!anySelected || libraryLocation !== null}
          familiarity={familiarity}
          onFamiliarityChange={setFamiliarity}
          libraryLocation={libraryLocation}
          breadcrumb={<>词典 › <b style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>{word}</b></>}
        />
      </div>

      {/* 内容列：保持居中；列宽与内边距取 lib/layout 的共享常量（ENTRY_BAND_WIDTH / ENTRY_COLUMN_PADDING）。
          v0.7.2 修复 3：导航条移出后本列不再需要 minHeight:'100%' / display:flex——那是为
          「列内首行是吸顶导航条」服务的，留着反而会让列比滚动区高出导航条那 32px（多出一条
          无意义的滚动余量）。去掉后与工作区 WordWorkbench 的内容列逐字同形。 */}
      <div style={{ maxWidth: `${ENTRY_BAND_WIDTH}px`, margin: '0 auto', padding: ENTRY_COLUMN_PADDING }}>
        {/* 词条头带（v0.7.2 §8.3 + 修复 1 / 2 / 6；v0.7.3 徽标改走 rightCluster）。
            修复 1「星级应在单词右侧、徽标应在右上角」：EntryBand 原有槽位要么落在词头**之前**
            （savedMark），要么自带一句说明文字（v0.7.2 的 strength / leechCount），返回页两者都不量，
            挂上去会印出假标签。v0.7.2 起 EntryBand 补上 `headwordEnd` 槽位（词头之后、与词头同基线的
            纯节点），星级与喇叭经它落位，词头排版回到单一出处，不再由本页自绘一份。
            **v0.7.3：徽标改走 `rightCluster`**（头带行的直接子节点，自带 `marginLeft:'auto'`）——
            先前塞在 `headwordEnd` 里由簇自己写 `marginLeft:'auto'` 的那套机制作废：`headwordEnd`
            作为 flex 项会收缩到内容宽度，那个 auto 边距在它自己的盒子里没有余量可分，等于没生效，
            徽标因此贴在星级后面（用户看到的「严重靠左」）。
            次序照设计稿 .hw-row（showcase-v2:796-799）：词 → 星级 → 喇叭 → 右端徽标簇。
            **喇叭刻意不放回 `speak` prop**：那个 prop 是紧贴词头之后的单个节点，星级只得排在它
            后面，读成「词 → 喇叭 → 星级」，与设计稿相反。星级在词头与喇叭之间，故整段由本节点出。
            修复 6「标题与 tab 之间去掉分割线」：头带经 `rule={false}` 不再出自己那道 1px 线，
            此后上下两块只剩页签条自己那道 2px 线——正合用户「直接用 tab 作分割线」。
            音标 / 词根由 WordTitleExtras 交出（可单独勾选合并，勾选框保留）。 */}
        <EntryBand
          headword={word}
          speak={false}
          rule={false}
          headwordEnd={
            <>
              <CollinsStars meta={meta} />
              <SpeakButton text={word} size={16} />
            </>
          }
          rightCluster={<TitleChips meta={meta} />}
          rows={<WordTitleExtras key={word} meta={meta} onInputsChange={setStripInputs} />}
        />

        {/* Tab 栏：词典 | 语义网络（凸起页签；语义网络徽章为 relatedWords 真实计数）。
            条面底 = --color-surface-sunken：**刻意偏离设计稿**——设计稿 .tabs 用 --paper（showcase-v2:172），
            而 --paper = #F9F8F5 正是我们的 --color-canvas；两页（此处与工作台 TabBar）在代码里都走 sunken。
            分支基线时 sunken 是更暗的一档（#EFECE5），条面确实凹陷，v0.7.2 的新档位只是压缩了这一步、
            未撤销意图——勿改回 canvas，否则白页签落白页、hover 的凹陷值（tabHoverOn）也失去依据。
            v0.7.2 修复 4 / 8：「共 N 条释义」计数移进「词典」页签内（页签右端、在页签的框里），
            「全部收起 / 全部展开」移到页签条最右端——与设计稿 .tabs 的 `.sp` + `.act`
            （showcase-v2:818-821：词典 / 语义网络 / 弹簧 / 全部收起）同序。 */}
        {/* 内边距取 layout.ts 的 TAB_STRIP_PADDING（v0.7.3 尾段 §4.1 / D18）：条面 24px 对齐内容列左缘，
            与工作区 TabBar 共用一份。
            **marginTop 已删净（P13(a)）**：先前那条 marginTop:12 把「头带 → 页签条」推到 20px（头带自己的
            8px 下内距 + 12），工作区同处是 22px（8 + 14）；删净后两页都只剩头带那 8px 下内距。
            **marginBottom 16 → 4（本任务 Step 4）**：与 SenseFlow 的 paddingTop 4 + 首个词性头 4 合起来，
            「页签条下缘 → 首个词性头」本页 12px（先前 34px），与工作区（外层 4 + 4 + 4）一致。 */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, padding: TAB_STRIP_PADDING, background: 'var(--color-surface-sunken)', borderBottom: '2px solid var(--color-border-strong)', marginBottom: 4 }}>
          <button type="button" onClick={() => setTab('dict')} style={tabStyle(tab === 'dict')}
            onMouseEnter={tabHoverOn(tab === 'dict')} onMouseLeave={tabHoverOff(tab === 'dict')}>
            词典
            {/* 计数按设计稿 .tab .cnt（showcase-v2:175）：11px 纯文本 / 三级字色 / 左距 5px，
                与「语义网络」页签上的那个同款，两个页签读起来一致。 */}
            {definitionCount > 0 && (
              <span style={{ marginLeft: 5, fontSize: 11, color: 'var(--color-text-tertiary)' }}>{definitionCount}</span>
            )}
          </button>
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
          {/* 弹簧（设计稿 .tabs .sp）把右端动作推到条的最右 */}
          <span style={{ flex: 1 }} />
          {collapseState.hasContainers && (
            <button
              type="button"
              onClick={() => cardRef.current?.toggleAll()}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-tertiary)' }}
              style={{
                // 设计稿 .tabs .act（showcase-v2:177）：11.5px / 三级字色 / padding:0 8px 6px
                fontSize: 11.5, fontFamily: 'var(--font-sans)', color: 'var(--color-text-tertiary)',
                padding: '0 8px 6px', border: 'none', background: 'transparent', cursor: 'pointer',
              }}
            >{collapseState.allCollapsed ? '全部展开' : '全部收起'}</button>
          )}
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
                onCollapseStateChange={handleCollapseStateChange}
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
