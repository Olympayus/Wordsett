import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { WordWithPreview } from '../../types/word'
import { useWordStore } from '../../stores/wordStore'
import { useCategoryStore } from '../../stores/categoryStore'
import { useFocusTrap } from '../../lib/useFocusTrap'
import { useMobilePopup } from '../../lib/mobilePopups'
import { hasCoarsePointer } from '../../lib/pointer'
import { touchInputStyles } from '../../lib/touchInput'
import { selectAll } from '../../lib/selection'
import CheckBox from '../ui/CheckBox'
import { Button } from '../ui/Button'

export type PickerDirection = 'add' | 'remove'

/**
 * 待选集（v0.6.5 §4.3）。**方向固定**、不做「勾选态即归属、确定时算差集」的一体式设计：
 * 差集模式在搜索过滤下是隐式全量写——用户搜出 3 个词、动了 1 个，其余 200 个的归属
 * 取决于它们是否恰好被加载进来。对「个人自用、无撤销」的场景太危险。
 *
 * 两个方向都是「按成员集取一边」：移除列成员，**加入列非成员**（v0.6.5 修订）。
 * 加入方向滤掉已在成员里的词，是因为把它们列出来没有任何可表达的意图——勾上再确认
 * 等于给一个已经在这个分类里的词再写一次同一条归属，用户既看不出差别（行尾的分类数
 * 不变），也得不到反馈。候选集与「这次操作会改变什么」对齐之后，列表里的每一行
 * 都是真的待办，确认键的「加入 N 个单词」里的 N 也才是一个真实的数量。
 *
 * 行尾那个「该词现有分类数」（§4.3）是**纯展示的补充读数**，刻意不并进这里：
 * pickerWords 的入参与返回值只认词表与成员集，它的用例锁的正是这套候选口径。
 * 分类数另从 wordCategoryMap 取（见组件内 categoryCountOf），两者互不影响。
 *
 * v0.7.5 Task 14：候选词表改为**两个模块的并集**（`wordStore.libraryWords`）。
 * 弹层从设置页打开，设置页是模块无关的——只列当前模块会让储藏库的成员在「移除」
 * 方向下凭空消失。谓词本身不变：仍是按成员集取一边，模块归属只是行尾的展示信息。
 */
export function pickerWords(
  all: WordWithPreview[],
  memberIds: Set<string>,
  direction: PickerDirection,
  query: string,
): WordWithPreview[] {
  // 「移除」要成员、「加入」要非成员：同一谓词取反，避免两条各写一遍过滤条件后漂移
  const wantMember = direction === 'remove'
  const scoped = all.filter(w => memberIds.has(w.id) === wantMember)
  const q = query.trim().toLowerCase()
  if (q === '') return scoped
  return scoped.filter(w => w.lemma.toLowerCase().includes(q))
}

export function pickerConfirmLabel(direction: PickerDirection, count: number): string {
  return direction === 'add' ? `加入 ${count} 个单词` : `移除 ${count} 个单词`
}

/**
 * 手机形态的脚键（v0.7.10 Task 17）：44dp、等分、发丝分隔。与 `MobileActionSheet`
 * 底栏同一份配方；文案比表格行短，字号取 14，半宽的格也放得下「全选当前列出的单词」。
 */
function sheetButtonStyle(divider: boolean, color: string, weight = 400): CSSProperties {
  return {
    flex: '1 1 0', minWidth: 0, height: 44, padding: '0 12px',
    appearance: 'none', border: 'none',
    borderLeft: divider ? '1px solid var(--color-border)' : 'none',
    background: 'transparent', color, fontSize: 14, fontWeight: weight,
    fontFamily: 'var(--font-sans)', cursor: 'pointer', whiteSpace: 'nowrap',
    touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent',
  }
}

export default function WordMultiPicker({ open, categoryName, memberIds, direction, onConfirm, onClose, variant = 'desktop' }: {
  open: boolean
  categoryName: string
  /**
   * 该分类当前的成员词 id——「移除」方向的候选范围与预勾选都由它决定。
   *
   * 下面的重置 effect 以**这个 prop 的引用**为触发条件，所以调用方必须把它 memo 住
   * （见 `CategorySettings.tsx` 的 `pickerMemberIds`）：每次渲染新建数组的话，用户刚点掉的
   * 勾会被重新勾回来。引用只在成员真的变了时才该变——那正是重置要发生的时刻。
   */
  memberIds: string[]
  direction: PickerDirection
  onConfirm: (wordIds: string[]) => void
  onClose: () => void
  /**
   * `mobile`（v0.7.10 Task 17）：全宽底部表——16px 搜索、44dp 行、底部
   * 「全选 / 清空 / 取消 / 确认」44dp，不再有 440px 定宽溢出。
   * **只有手机外壳传**；平板与桌面保持居中弹窗（默认 `desktop`）。
   */
  variant?: 'desktop' | 'mobile'
}) {
  const isMobile = variant === 'mobile'
  // 候选词表是**两个模块的并集**（v0.7.5 Task 14）：设置页与模块无关，只读当前模块
  // 会让储藏库的成员在「移除」方向下消失。每行的 location 随预览一起带出，用于行尾标注。
  const libraryWords = useWordStore(s => s.libraryWords)
  const wordCategoryMap = useCategoryStore(s => s.wordCategoryMap)
  const panelRef = useRef<HTMLDivElement>(null)
  // 手机版是底部表：不锁焦点（与 `CategoryAssignModal` 同一取舍）；桌面 / 平板照旧。
  useFocusTrap(open && !isMobile, panelRef)
  // 弹层开着时登记给外壳：安卓返回键先关弹层，而不是退出设置页。
  useMobilePopup(open, onClose)

  const [query, setQuery] = useState('')
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const members = useMemo(() => new Set(memberIds), [memberIds])
  // 触摸输入档（v0.7.10 §7.4）：手机形态直接强制开（16px 搜索框）；
  // 桌面 / 平板按主指针判断，鼠标环境为空对象、样式逐字不变。
  const touch = isMobile || hasCoarsePointer()

  // 预勾选的来源：**实际会被渲染出来的候选**，不是 memberIds 本身。
  //
  // memberIds 来自 wordCategoryMap，行渲染来自 wordStore.libraryWords，两者各走各的加载路径，
  // 谁都不保证 memberIds ⊆ libraryWords（getAllPreviews 在 DB 出错时返回 []，而并集初始为空、
  // 由异步的 loadWords 填充）。若直接拿 memberIds 播种，两边一旦对不上，checked 里就会
  // 装着一批**屏幕上没有行**的 id：列表空、确认键却亮着「移除 N 个单词」，而 N 是整个
  // 成员数——一次用户看不见、也无法审阅的批量 unassignMany。种子取自 rendered 候选之后，
  // checked ⊆ removeCandidates ⊆ libraryWords 成为结构性事实，不再靠断言维持。
  const removeCandidates = useMemo(
    () => pickerWords(libraryWords, members, 'remove', ''),
    [libraryWords, members])

  // 每次打开都重置：方向与分类变了就该重新来。「移除」预勾选全部候选，「加入」全不勾。
  // query 不在依赖里：打字**不得**重新播种，否则筛选一下就把筛选外的勾清掉。
  // libraryWords 在依赖里是有意的——弹层开着时 loadWords 落地（原先的空并集 → 真实词表）
  // 正是该重播种的时刻，且 removeCandidates 只随 libraryWords/members 变，无关重渲染不会触发。
  useEffect(() => {
    if (!open) return
    setQuery('')
    setChecked(direction === 'remove' ? new Set(removeCandidates.map(w => w.id)) : new Set())
  }, [open, direction, removeCandidates])

  const shown = useMemo(
    () => pickerWords(libraryWords, members, direction, query),
    [libraryWords, members, direction, query])

  // 行尾的分类数：wordCategoryMap 本就是「词 → 它所属的分类 id 列表」，长度即答案，
  // 不另开查询。与上面的候选集**刻意解耦**——读的是 store，不是 pickerWords 的口径。
  const categoryCountOf = (wordId: string) => (wordCategoryMap[wordId]?.length ?? 0)

  // 空态说「这里为什么是空的」，按成因分三句，不能只按方向分：
  //  - 搜索无结果 → 没匹配上（两个方向同一句）
  //  - 加入方向、没搜索却空 → 词库里的词都已经是这个分类的成员（词库本身为空时另说）
  //  - 移除方向、没搜索却空 → 这个分类本来就没有词
  // 「加入」那一支是本次候选集收窄后新出现的态：收窄前它永远列全库，压根空不了。
  // 「词库为空」按并集判断：储藏库里只有词、工作区为空时，说「词库为空」是假话。
  const emptyText = query.trim() !== ''
    ? '没有匹配的单词'
    : direction === 'add'
      ? (libraryWords.length === 0 ? '词库为空，使用顶部搜索框添加单词' : '所有单词都已在这个分类里')
      : (members.size > 0 ? '没有匹配的单词' : '这个分类下还没有单词')

  if (!open) return null

  if (isMobile) {
    return (
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
        style={{ position: 'fixed', inset: 0, background: 'var(--color-scrim)', zIndex: 'var(--z-modal)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column',
            background: 'var(--color-surface)', borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
            boxShadow: 'var(--shadow-overlay)', fontFamily: 'var(--font-sans)', overflow: 'hidden',
          }}
        >
          {/* 方向写进标题：用户在确认时不会把它搞反 */}
          <div style={{ flexShrink: 0, padding: '16px 16px 12px', borderBottom: '1px solid var(--color-border)', fontFamily: 'var(--font-serif)', fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', overflowWrap: 'anywhere' }}>
            {direction === 'add' ? `把单词加入「${categoryName}」` : `把单词移出「${categoryName}」`}
          </div>

          <div style={{ flexShrink: 0, padding: '12px 16px' }}>
            <input
              type="text"
              placeholder="搜索单词…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ width: '100%', minWidth: 0, height: '32px', padding: '0 10px', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', outline: 'none', ...touchInputStyles(touch), ...(touch ? { height: 'auto' } : null) }}
            />
          </div>

          <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', borderTop: '1px solid var(--color-border)' }}>
            {shown.length === 0 ? (
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', padding: '24px 16px', textAlign: 'center' }}>
                {emptyText}
              </div>
            ) : shown.map((w, i) => (
              <label key={w.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: '44px', padding: '10px 16px', cursor: 'pointer', borderBottom: i === shown.length - 1 ? 'none' : '1px solid var(--color-border)' }}>
                <CheckBox
                  checked={checked.has(w.id)}
                  label={w.lemma}
                  onChange={() => setChecked(prev => {
                    const next = new Set(prev)
                    if (next.has(w.id)) next.delete(w.id); else next.add(w.id)
                    return next
                  })}
                />
                <span style={{ minWidth: 0, overflowWrap: 'anywhere', fontFamily: 'var(--font-serif)', fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>{w.lemma}</span>
                {/* 行尾补充读数：模块归属 + 该词现有分类数，口径与桌面逐字相同。 */}
                <span style={{ marginLeft: 'auto', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                  <span>{w.location === 'archive' ? '储藏库' : '工作区'}</span>
                  <span>{categoryCountOf(w.id)}</span>
                </span>
              </label>
            ))}
          </div>

          <div style={{ flexShrink: 0, borderTop: '1px solid var(--color-border)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {/* 全选是**替换**、只覆盖当前列出的行（与桌面同一个 `selectAll` 契约），
                作用域由按钮文案直接说出来。 */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)' }}>
              <button type="button" onClick={() => setChecked(selectAll(shown.map(w => w.id)))} style={sheetButtonStyle(false, 'var(--color-text-secondary)')}>
                全选当前列出的单词
              </button>
              <button type="button" onClick={() => setChecked(new Set())} style={sheetButtonStyle(true, 'var(--color-text-secondary)')}>
                清空
              </button>
            </div>
            <div style={{ display: 'flex' }}>
              <button type="button" onClick={onClose} style={sheetButtonStyle(false, 'var(--color-text-secondary)')}>
                取消
              </button>
              <button
                type="button"
                disabled={checked.size === 0}
                onClick={() => onConfirm([...checked])}
                style={{
                  ...sheetButtonStyle(true, checked.size === 0 ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)', 600),
                  cursor: checked.size === 0 ? 'default' : 'pointer',
                }}
              >
                {pickerConfirmLabel(direction, checked.size)}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'var(--color-scrim)', zIndex: 'var(--z-modal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div style={{ width: '440px', maxWidth: 'min(440px, 100vw - 32px)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '20px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-overlay)' }}>
        {/* 方向写进标题：用户在确认时不会把它搞反 */}
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', marginBottom: '14px' }}>
          {direction === 'add' ? `把单词加入「${categoryName}」` : `把单词移出「${categoryName}」`}
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <input
            type="text"
            placeholder="搜索单词…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ flex: 1, minWidth: 0, height: '32px', padding: '0 10px', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-sans)', color: 'var(--color-text-primary)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', outline: 'none', ...touchInputStyles(touch), ...(touch ? { height: 'auto' } : null) }}
          />
          {/* 全选是**替换**（selectAll 的契约），只覆盖当前列出来的行：搜索态下点它会把
              筛选外的成员移出勾选集。方向是「少移」而非「多移」，确认键的数字永远是真的，
              这个作用域由按钮文案直接说出来（原生 title 已全站移除），不再靠悬停。 */}
          <Button variant="secondary" onClick={() => setChecked(selectAll(shown.map(w => w.id)))}>全选当前列出的单词</Button>
          <Button variant="secondary" onClick={() => setChecked(new Set())}>清空</Button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '4px' }}>
          {shown.length === 0 ? (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', padding: '16px', textAlign: 'center' }}>
              {emptyText}
            </div>
          ) : shown.map(w => (
            <label key={w.id} style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '6px 8px', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
              <CheckBox
                checked={checked.has(w.id)}
                label={w.lemma}
                onChange={() => setChecked(prev => {
                  const next = new Set(prev)
                  if (next.has(w.id)) next.delete(w.id); else next.add(w.id)
                  return next
                })}
              />
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>{w.lemma}</span>
              {/* 行尾补充读数（v0.7.5 Task 14）：先标注所属模块，再给该词现有分类数（§4.3）。
                  两者都是行内小字、够不着「统计数字」的量级，故走三级灰 + xs 字号，
                  不套 .stat-num（那套无衬线+表格数字+主色+半粗是给统计量的）。
                  模块标注是**纯展示**：候选口径仍只由 pickerWords 的成员谓词决定。 */}
              <span style={{ marginLeft: 'auto', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                <span>{w.location === 'archive' ? '储藏库' : '工作区'}</span>
                <span>{categoryCountOf(w.id)}</span>
              </span>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button disabled={checked.size === 0} onClick={() => onConfirm([...checked])}>
            {pickerConfirmLabel(direction, checked.size)}
          </Button>
        </div>
      </div>
    </div>
  )
}
