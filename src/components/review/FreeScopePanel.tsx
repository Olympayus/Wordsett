import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import FreeScopeTabs from './FreeScopeTabs'
import FreeScopeStats, { type FreeOverview } from './FreeScopeStats'
import type { ReviewStats } from './StatsMini'
import Tooltip from '../ui/Tooltip'
import Icon from '../icons'
import CheckBox from '../ui/CheckBox'
import { getWeakWords, getDueWordIds, REVIEW_DEFAULTS, type ReviewParams } from '../../services/reviewService'
import { getWordCategoryMap } from '../../services/categoryService'
import { aggregateCategoryCounts, freeScopeEmptyText, freeScopeSummaryText } from '../../lib/review/categoryCounts'
import type { FreeScopeKind } from '../../lib/review/types'
import type { FreeScopeSelection } from '../../lib/review/startButton'
import { FREE_SCOPE_LABEL } from '../../lib/review/scopeLabel'
import { jumpToWord } from '../../lib/review/jumpToWord'
import { hasCoarsePointer } from '../../lib/pointer'
import { touchInputStyles } from '../../lib/touchInput'
import { useSettingsStore } from '../../stores/settingsStore'
import { useWordStore } from '../../stores/wordStore'

export type { FreeScopeKind } from '../../lib/review/types'

/**
 * 手机端范围卡片的顺序（v0.7.6 §3.8）：分类强化 → 薄弱词专项 → 今日队列重练 → 全库随机。
 *
 * **刻意与桌面页签条 `SCOPE_TABS` 的顺序不同**：设计稿为手机布局单独列举了这个次序
 * （两处权威文档都这么写），桌面页签条照旧用自己的顺序。这里只存 key，
 * 标题仍按 key 取 `FREE_SCOPE_LABEL`，不在本文件重抄中文名。
 */
const MOBILE_SCOPE_ORDER: FreeScopeKind[] = ['category', 'weak', 'today', 'random']

/**
 * 手机端范围卡片的一行说明（v0.7.6 §3.8）。
 * 按范围 key 索引、不按标签文字索引：标签改了名，按文字找的说明会静默失配。
 * 标题本身不用这张表，直接取 `FREE_SCOPE_LABEL`（与页签、控制台同源）。
 */
const MOBILE_SCOPE_DESC: Record<FreeScopeKind, string> = {
  category: '按分类抽词，可多选',
  weak: '连错达到阈值，或近 7 天答错',
  today: '今天到期的队列',
  random: '工作台全部词条',
}

/**
 * 数量速选（v0.7.10 §7.7）：10 / 20 / 50，自定义走右侧数字输入。
 * `random` / `category` / `weak` 共用同一组；`today` 不渲染数量（按当前到期队列全量出题）。
 * 选中的速选值就是 `limit` 本身，不另存一个「当前速选」状态——自定义输入改了 limit 后，
 * 与某个速选值相等时那枚按钮自然亮起。
 */
const QUICK_LIMITS = [10, 20, 50] as const

export default function FreeScopePanel({ categories, variant = 'desktop', value, onChange, start, overview, stats }: {
  // color 一并带进来（v0.6.3 条目 6）：分类行的勾选框要按分类走色，
  // 写进 prop 类型而不是在面板里另取一份，是为了让别的调用点漏传时编译器先叫。
  categories: { id: string; name: string; color: string }[]
  /**
   * 外壳形态（v0.7.6 §3.8）。缺省 `desktop`；手机外壳由 `ReviewModule` 传 `mobile`，
   * 桌面调用点不传，行为不变。
   */
  variant?: 'desktop' | 'mobile'
  /**
   * 当前范围选择（v0.7.10 §7.7）。状态由 `ReviewModule` 顶层持有：左栏开始按钮与
   * 本面板必须读同一份选择，本组件只做受控渲染（props in / events out）。
   */
  value: FreeScopeSelection
  onChange: (next: FreeScopeSelection) => void
  /**
   * 手机端「开始练习」插槽（v0.7.10 §7.7）。按钮仍在范围卡下方、内容清单之前，位置与
   * 几何不变；按钮本身由 `ReviewModule` 组装——开一轮会话要读写库与 store，受控面板
   * 不复制那套逻辑。桌面不传（按钮已统一到左栏控制台下方）。
   */
  start?: ReactNode
  /**
   * 自由练习读数块的数（v0.7.10 §7.7 / Task 22）：`getOverview` 的今日到期 / 涉及词数 /
   * 今日已练。面板原样转给 `FreeScopeStats`，自己不取数；手机分支以紧凑几何渲染同一份数
   * （Task 23）。概览尚未读到或读失败时为 null，读数按 0 兜底。
   */
  overview: FreeOverview | null
  /** 复习统计（`overview.stats`，`ReviewModule` 负责兜底空值）。`random` 的熟悉度条与 7 天读数用它。 */
  stats: ReviewStats
}) {
  const mobile = variant === 'mobile'
  // 触摸输入档（v0.7.10 §7.4）：本组件桌面与手机外壳共用、没有 `touch` prop，按主指针判断；
  // 桌面鼠标环境为空对象，数量框样式逐字不变。
  const touch = hasCoarsePointer()
  const reviewSettings = useSettingsStore(s => s.review)
  const params: ReviewParams = { ...REVIEW_DEFAULTS, ...reviewSettings }
  // 词库总数：v0.7.5 Task 12 起是**工作区**词数，不是 `words.length`——
  // 后者跟着侧栏当前模块走（在储藏库模块下会显示储藏库的词数），而复习只认工作区。
  // 计数由 useWordStore 的 loadWords 顺带刷新，不新增 db 查询。
  const wordCount = useWordStore(s => s.counts.workspace)
  const { kind, categoryIds, limit } = value
  const [rows, setRows] = useState<{ id: string; name: string; color: string; wordCount: number; dueCount: number }[]>([])
  // 分类计数读失败：与「库里没有分类」分开讲——前者用户只能重试或换个范围，
  // 后者要去工作台建分类，混成同一个空盒子两边都答不上来。
  // 三态判据抽在 freeScopeEmptyText 里（见下）：读失败 / 库里确实没有分类 / 还在读。
  // 最后一支必须**不说话**——rows 初值是 []，把它当「空」会在读到之前先闪一句假话。
  const [rowsFailed, setRowsFailed] = useState(false)
  const [weak, setWeak] = useState<Awaited<ReturnType<typeof getWeakWords>>>([])

  // 薄弱词列表按当前阈值实时取；只在切到该页时拉
  useEffect(() => {
    if (kind !== 'weak') return
    let alive = true
    getWeakWords(params).then(rows => { if (alive) setWeak(rows) })
    return () => { alive = false }
  }, [kind, params.leechThreshold])

  // 分类强化的行信息：词数与待复习数（v0.6.2 条目 10）。只在切到该页时拉。
  //
  // 依赖数组刻意不用 `categories` 本身：它在 ReviewModule 里是 `categories.map(...)`
  // 现造的数组，每次渲染都是新身份，直接进依赖会让这个 effect 每渲染都重跑一遍。
  // 用 id 拼成的字符串做稳定 key。
  const categoryKey = categories.map(c => c.id).join('|')
  // 空态文案（null = 什么都不说）：读失败 / 库里真的没有分类 / 还在读（这一支沉默）。
  // `categories.length > 0` 与下面 effect 依赖里的 `categoryKey !== ''` 是同一个值；
  // 三支之间为什么这样分、哪一支曾经答错，都写在 freeScopeEmptyText 的注释与它的用例里。
  const emptyText = freeScopeEmptyText(categories.length > 0, rowsFailed)
  useEffect(() => {
    if (kind !== 'category') return
    let alive = true
    void (async () => {
      // try/catch 与 ReviewModule 的取数同款：读失败时落到确定的空值，
      // 让页面显示「读不到分类」，而不是一直空转、按钮永远灰着又没话说。
      // 两个读都可能 reject（getWordCategoryMap 背后是 getDb()，未初始化时直接抛），
      // Promise.all 会把任一个的失败一起带上来，一处 catch 够用。
      try {
        const [wordCategoryMap, dueWordIds] = await Promise.all([
          // 只取工作区：储藏库词不能把分类的「N 词」撑起来（v0.7.5 Task 12），
          // 否则一个全归档的分类看起来可选、点进去却出一轮空题。
          getWordCategoryMap('workspace'),
          getDueWordIds(params),
        ])
        if (!alive) return
        setRows(aggregateCategoryCounts(categories, wordCategoryMap, dueWordIds))
        setRowsFailed(false)
      } catch {
        if (!alive) return
        setRows([])
        setRowsFailed(true)
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- categories 的身份不稳定，用 categoryKey 代
  }, [kind, categoryKey, params.leechThreshold])

  // 不计分提示：桌面上放在页签条右端，手机上跟着区块标题走——两种形态都保留同一条说明。
  const infoTip = (
    <Tooltip content="自由练习不计分，不影响各单词的掌握程度">
      <span style={{ display: 'inline-flex', color: 'var(--color-text-tertiary)', cursor: 'default' }}>
        <Icon name="info" size={14} />
      </span>
    </Tooltip>
  )

  return (
    <div className="flex flex-col" style={{ minHeight: '100%' }}>
      {mobile ? (
        /* 手机（v0.7.6 §3.8）：页签条换成 2×2 卡片，顺序取 MOBILE_SCOPE_ORDER
           （与桌面页签条不同，理由见该常量的注释）。标题按 key 取 FREE_SCOPE_LABEL，
           说明按 key 取 MOBILE_SCOPE_DESC——中文名不在本文件出现第二份。 */
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '14px 16px 0' }}>
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 6, fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-serif)' }}>
            选择练习范围
            {infoTip}
          </div>
          {MOBILE_SCOPE_ORDER.map(key => {
            const on = key === kind
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...value, kind: key })}
                style={{
                  minWidth: 0, padding: 12, borderRadius: 8, textAlign: 'left', cursor: 'pointer',
                  border: '1px solid transparent', fontFamily: 'var(--font-sans)', color: 'inherit',
                  background: on ? 'var(--color-surface)' : 'var(--color-surface-sunken)',
                  ...(on ? { borderColor: 'var(--color-border-strong)' } : null),
                  transition: 'background-color var(--duration-fast) var(--ease-smooth), border-color var(--duration-fast) var(--ease-smooth)',
                  touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
                }}
              >
                <div style={{ fontSize: 13.5, fontWeight: on ? 600 : 400 }}>{FREE_SCOPE_LABEL[key]}</div>
                <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
                  {MOBILE_SCOPE_DESC[key]}
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <FreeScopeTabs active={kind} onSelect={k => onChange({ ...value, kind: k })} right={infoTip} />
      )}

      {/* 手机：开始练习紧贴 2×2 范围卡下方（v0.7.6 收尾，用户确认）。它回答的是
          「按当前范围开一轮」，与范围卡是同一件事，故排在分类 / 薄弱词清单与题数之前，
          不必滚过整张清单才够得着。桌面仍在内容区末尾，那里有 620px 限宽、一屏看得下。
          宽度与范围卡同宽，用同一侧的内边距 16。
          v0.7.10 §7.7：按钮节点改由 `ReviewModule` 经 `start` 插槽传入——开一轮要读库与
          store，受控面板不复制那套逻辑；位置与包裹层逐字不变。 */}
      {mobile && start !== undefined && (
        <div style={{ display: 'flex', width: '100%', padding: '12px 16px 0' }}>{start}</div>
      )}

      <div
        className="flex flex-col items-start gap-5 p-8"
        style={mobile
          ? { padding: '16px 16px 24px', maxWidth: 'none', width: '100%' }
          : { maxWidth: '620px' }}
      >
        {/* 标题随标签页变（v0.6.2 条目 17）：原来写死「自由练习」，
            与上面的页签对不上。文案与 SCOPE_TABS / 控制台的「范围」同源。
            手机端由卡片表达当前范围，这行标题不再出现（v0.7.6 §3.8）。 */}
        {!mobile && (
          <h2 style={{ fontSize: '20px', fontWeight: 600, fontFamily: 'var(--font-serif)' }}>
            {FREE_SCOPE_LABEL[kind]}
          </h2>
        )}

        {kind === 'weak' && (
          weak.length === 0 ? (
            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
              暂无薄弱词<br />
              连错达到阈值，或近 7 天答错的词会出现在这里。阈值在设置 → 复习里调。
            </div>
          ) : (
            <div style={{ width: '100%' }}>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                共 <span className="stat-num">{weak.length}</span> 词
                <Tooltip click content="连错达到阈值，或近 7 天答错的词会优先出现在这里。阈值在设置 → 复习里调。">
                  <button
                    type="button"
                    aria-label="薄弱词的判定说明"
                    style={{
                      width: 14, height: 14, padding: 0, borderRadius: '50%', cursor: 'pointer',
                      border: '1px solid var(--color-border-strong)', background: 'var(--color-surface)',
                      color: 'var(--color-text-tertiary)', fontSize: 9.5, fontStyle: 'italic',
                      fontFamily: 'var(--font-serif)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >i</button>
                </Tooltip>
              </div>
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                {weak.map(w => (
                  <button
                    key={w.wordId}
                    type="button"
                    onClick={() => void jumpToWord(w.wordId)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                      padding: '8px 12px', border: 'none', borderBottom: '1px solid var(--color-surface-sunken)',
                      background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 13, fontFamily: 'var(--font-serif)', minWidth: 96 }}>{w.lemma}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {w.translation.split('\n')[0]}
                    </span>
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--color-accent-soft)', color: 'color-mix(in srgb, var(--color-accent) 70%, black)' }}>
                      {w.lapses > 0 ? `连错 ${w.lapses} 次` : `近 7 天答错 ${w.recentMisses} 次`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )
        )}

        {kind === 'category' && (
          <div style={{ width: '100%' }}>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: 8 }}>
              勾选要出题的分类，可多选
            </div>
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              {emptyText !== null && (
                <div style={{ padding: '12px', fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
                  {emptyText}
                </div>
              )}
              {rows.map(r => {
                // 闸门看的是**词数**而不是待复习数（v0.6.2 条目 10 的闸门，评审修正）：
                // 自由练习的候选池是 getAllCandidates（含未到期的熟词），
                // 所以「待复习 0」的分类照样可能出一整轮卡——按它置灰会把能用的分类
                // 整片挡掉。只有一个词都没有的分类才是真的出不了题。
                // 待复习数仍然显示：它是「现在就该复习的有几个」，与闸门的判据不是一回事。
                const disabled = r.wordCount === 0
                const on = categoryIds.includes(r.id)
                return (
                  <label
                    key={r.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '8px 12px', borderBottom: '1px solid var(--color-surface-sunken)',
                      cursor: disabled ? 'default' : 'pointer',
                      opacity: disabled ? 0.5 : 1,
                    }}
                  >
                    <CheckBox
                      checked={on}
                      disabled={disabled}
                      color={r.color}
                      onChange={() => onChange({
                        ...value,
                        categoryIds: on ? categoryIds.filter(x => x !== r.id) : [...categoryIds, r.id],
                      })}
                      label={`选择分类 ${r.name}`}
                    />
                    {/* 分类色圈（v0.6.3 打磨）：勾选框只在**勾上**时才显示分类色，
                        未勾选的行看不出这是哪个分类。规格与设置 → 分类管理那一行一致
                        （10px 圆点、50% 圆角、取分类原色），两处对照才读得出是同一个东西。
                        它只是分类的标识，不参与选中态——选中与否仍只由勾选框表达；
                        禁用行的整体降透明度由外层 label 的 opacity 负责，这里不再表达一次。 */}
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: r.color, flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, fontSize: 13, fontFamily: 'var(--font-serif)', minWidth: 96 }}>{r.name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                      {/* 两个数字都套 .stat-num（v0.6.3 评审 F3）：同一行里只给待复习数套、
                          词数留在外面，会让两个数一种表格数字一种比例数字，读起来像两种量。 */}
                      <span className="stat-num">{r.wordCount}</span> 词 · 待复习 <span className="stat-num">{r.dueCount}</span>
                    </span>
                  </label>
                )
              })}
            </div>
            {/* M = Σ 已勾选分类的**待复习**数（spec §4.3 的口径），不是可出题数：
                出题走 getAllCandidates（含未到期的熟词），所以 M 可能是 0 而按钮照样可用
                ——那是「没有到期的词」，不是「没有题」。括号里点明口径，免得读成承诺；
                也免得下一个人把这里改成求和闸门用的那个数（那是词数，含义不同）。 */}
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-secondary)' }}>
              {freeScopeSummaryText(categoryIds, rows)}
            </div>
          </div>
        )}

        {/* 内容块（v0.7.10 §7.7、Task 22）：全库随机 = 工作区词数 / 近 7 天读数 / 熟悉度 6 档；
            今日队列重练 = 今日到期 / 涉及词数 / 今日已练 / 未来 8 根到期柱。数据全由 props 进。
            桌面在本内容区里渲染；手机由 Task 23 传 `mobile` 紧凑几何——内容区紧跟开始按钮，
            故它自然落在「范围卡下方、开始按钮之后」，随既有滚动容器滚动。 */}
        {(kind === 'random' || kind === 'today') && (
          <FreeScopeStats
            kind={kind}
            variant={mobile ? 'mobile' : 'desktop'}
            workspaceCount={wordCount}
            stats={stats}
            overview={overview}
          />
        )}

        {/* 数量：10 / 20 / 50 速选 + 自定义输入（spec §7.7；沿用受控 `limit` 与 min/max 语义）。
            只对 random / category / weak 有意义：今日队列重练按当前到期队列全量出题，整块不渲染。
            选中态与策略列表同一套语言——白面 + 强描边 + 600；不新增色值。 */}
        {kind !== 'today' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: '13px' }}>
            <span>数量</span>
            <div role="group" aria-label="数量速选" style={{ display: 'flex', gap: 6 }}>
              {QUICK_LIMITS.map(n => {
                const on = limit === n
                return (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onChange({ ...value, limit: n })}
                    style={{
                      minWidth: touch ? 44 : undefined,
                      minHeight: touch ? 40 : undefined,
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-lg)',
                      border: `1px solid ${on ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
                      background: on ? 'var(--color-surface)' : 'transparent',
                      color: 'inherit',
                      fontWeight: on ? 600 : 400,
                      fontFamily: 'var(--font-sans)',
                      fontSize: '13px',
                      cursor: 'pointer',
                      touchAction: 'manipulation',
                    }}
                  >{n}</button>
                )
              })}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>自定义</span>
              <input
                type="number" min={1} max={100} value={limit}
                aria-label="自定义数量"
                onChange={e => onChange({ ...value, limit: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })}
                style={{ width: '80px', padding: '4px 8px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-strong)', background: 'transparent', color: 'inherit', fontSize: '13px', ...touchInputStyles(touch) }}
              />
            </label>
          </div>
        )}

        {/* 桌面的「开始练习」已统一到左栏控制台下方（v0.7.10 §7.7），本组件不再渲染。 */}
      </div>
    </div>
  )
}
