import { useEffect, useState } from 'react'
import FreeScopeTabs from './FreeScopeTabs'
import Tooltip from '../ui/Tooltip'
import Icon from '../icons'
import SquareButton from '../ui/SquareButton'
import CheckBox from '../ui/CheckBox'
import { getWeakWords, getDueWordIds, REVIEW_DEFAULTS, type ReviewParams } from '../../services/reviewService'
import { getWordCategoryMap } from '../../services/categoryService'
import { aggregateCategoryCounts, canStartFreeScope, freeScopeEmptyText, freeScopeSummaryText } from '../../lib/review/categoryCounts'
import type { FreeScopeKind } from '../../lib/review/types'
import { FREE_SCOPE_LABEL } from '../../lib/review/scopeLabel'
import { jumpToWord } from '../../lib/review/jumpToWord'
import { useSettingsStore } from '../../stores/settingsStore'
import { useWordStore } from '../../stores/wordStore'

export type { FreeScopeKind } from '../../lib/review/types'

export default function FreeScopePanel({ categories, onStart }: {
  // color 一并带进来（v0.6.3 条目 6）：分类行的勾选框要按分类走色，
  // 写进 prop 类型而不是在面板里另取一份，是为了让别的调用点漏传时编译器先叫。
  categories: { id: string; name: string; color: string }[]
  onStart: (scope: { kind: FreeScopeKind; categoryIds?: string[]; limit: number }) => void
}) {
  const reviewSettings = useSettingsStore(s => s.review)
  const params: ReviewParams = { ...REVIEW_DEFAULTS, ...reviewSettings }
  // 词库总数：与侧栏「单词总数」同源（useWordStore 的 words.length）。
  // 数据在启动时已加载、SidebarFooter 也订阅着同一份，故不新增 db 查询。
  const wordCount = useWordStore(s => s.words.length)
  const [kind, setKind] = useState<FreeScopeKind>('random')
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [rows, setRows] = useState<{ id: string; name: string; color: string; wordCount: number; dueCount: number }[]>([])
  // 分类计数读失败：与「库里没有分类」分开讲——前者用户只能重试或换个范围，
  // 后者要去工作台建分类，混成同一个空盒子两边都答不上来。
  // 三态判据抽在 freeScopeEmptyText 里（见下）：读失败 / 库里确实没有分类 / 还在读。
  // 最后一支必须**不说话**——rows 初值是 []，把它当「空」会在读到之前先闪一句假话。
  const [rowsFailed, setRowsFailed] = useState(false)
  const [limit, setLimit] = useState(20)
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
          getWordCategoryMap(),
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

  return (
    <div className="flex flex-col" style={{ minHeight: '100%' }}>
      <FreeScopeTabs
        active={kind}
        onSelect={setKind}
        right={
          <Tooltip content="自由练习不计分，不影响各单词的掌握程度">
            <span style={{ display: 'inline-flex', color: 'var(--color-text-tertiary)', cursor: 'default' }}>
              <Icon name="info" size={14} />
            </span>
          </Tooltip>
        }
      />

      <div className="flex flex-col items-start gap-5 p-8" style={{ maxWidth: '620px' }}>
        {/* 标题随标签页变（v0.6.2 条目 17）：原来写死「自由练习」，
            与上面的页签对不上。文案与 SCOPE_TABS / 控制台的「范围」同源。 */}
        <h2 style={{ fontSize: '20px', fontWeight: 600, fontFamily: 'var(--font-serif)' }}>
          {FREE_SCOPE_LABEL[kind]}
        </h2>

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
                      onChange={() => setCategoryIds(prev => on ? prev.filter(x => x !== r.id) : [...prev, r.id])}
                      label={`选择分类 ${r.name}`}
                    />
                    <span style={{ fontWeight: 600, fontSize: 13, fontFamily: 'var(--font-serif)', minWidth: 96 }}>{r.name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-secondary)' }}>
                      {/* 两个数字都套 .stat-num（v0.6.3 评审 F3）：同一行里只给待复习数套、
                          词数留在外面，会让两个数一种等宽一种比例，读起来像两种量。 */}
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

        {kind === 'random' && (
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            词库共 <span className="stat-num">{wordCount}</span> 词
          </div>
        )}

        <label className="flex items-center gap-2" style={{ fontSize: '13px' }}>
          数量
          <input
            type="number" min={1} max={100} value={limit}
            onChange={e => setLimit(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
            style={{ width: '80px', padding: '4px 8px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-strong)', background: 'transparent', color: 'inherit', fontSize: '13px' }}
          />
        </label>

        {/* 判据抽在 canStartFreeScope 里（Review Focus 3），组件只消费结果；
            禁用观感（灰底 + 0.55 不透明度 + default 光标）交给 SquareButton 自带的
            BUTTON_DISABLED，不再在本处另写一份 opacity。 */}
        <SquareButton
          tone="surface"
          disabled={!canStartFreeScope(kind, categoryIds)}
          onClick={() => onStart({
            kind,
            categoryIds: kind === 'category' ? categoryIds : undefined,
            limit,
          })}
        >
          开始练习
        </SquareButton>
      </div>
    </div>
  )
}
