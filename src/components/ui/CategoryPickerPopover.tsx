import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useCategoryStore } from '../../stores/categoryStore'
import { useUiStore } from '../../stores/uiStore'
import Icon from '../icons'

/**
 * 分类下拉浮层（v0.6.5 §4.6）。侧栏批量条的「加入分类 / 从分类移除」与词典返回页的两处
 * 「＋」共用同一枚组件——它们的选项集合与语义完全相同，各写一份会漂。
 *
 * 不设「未分类」项：不加入任何分类就是归类为空，那是「从分类移除」的语义。
 * 一个分类都没有时给空态 + 「新建分类」，点它只开分类编辑器，**不接着执行原动作**——
 * 避免「建完分类后要不要继续」这种半途状态。
 *
 * **定位契约（v0.6.5 修订：absolute → fixed + 锚点元素）**：
 * 面板是 `position: fixed`，落点由 `anchor` 这个 DOM 元素的视口矩形现算（popoverPosition）。
 * 旧版是 `absolute` + 「调用方必须把自己包在 position: relative 的容器里」，那个契约
 * 有两个改不掉的结果：
 *   1. **被祖先裁掉**。词条卡的根节点是 `overflow-hidden`（圆角描边需要），而「＋」在卡内，
 *      向下展开的面板整块落在卡的边框盒之外 → 被裁得一干二净，用户点开什么也看不见。
 *      侧栏那条同理（AppShell 的 <aside> 也是 overflow: hidden）。
 *   2. **宽度被容器绑架**。面板 maxWidth: 100% 按包含块解析，于是两个调用点各自要塞一个
 *      `minWidth: 220` 的空壳撑宽度，而那空壳里按钮靠左排 → 「＋」离右边缘还差 190px，
 *      看着像没有右对齐。
 * fixed 的包含块是视口（祖先里没有 transform / will-change / contain: paint），
 * 因此既不吃祖先的 overflow 裁剪，也不再需要撑宽度的空壳。落点自己收口：
 * 放不下就翻到对面，两边都不够就在视口内推回并压低高度，见 popoverPosition。
 *
 * 全屏透明遮罩仍用 position: fixed：它只负责捕获外部点击，不需要跟着锚点走。
 *
 * 每项末尾带**该分类现有词数**（§4.6）：从 wordCategoryMap 反向数，不另开一次查询——
 * 那张表本来就是「词 → 分类 id 列表」，反向聚合即成员数，且与设置页那一列同源同口径。
 */

/** 面板与锚点之间的缝隙；面板与视口边缘之间的最小余量。 */
export const POPOVER_GAP = 4
export const POPOVER_MARGIN = 8
/** 面板高度上限（视口比例）。二三十个分类够放，同时给「翻到对面」留出判断余地。 */
export const POPOVER_MAX_HEIGHT_RATIO = 0.6

export interface PopoverRect { left: number; top: number; right: number; bottom: number }
export interface PopoverBox { width: number; height: number }

/**
 * 浮层落点（纯函数）。node 环境测不到 DOM，几何只能这样钉：给视口、锚点与面板尺寸，
 * 算出面板该去的位置与高度上限，且**保证结果整块落在视口内**（除非视口比面板的
 * 最小可用高度还小——那时也只能做到不越界）。
 *
 * 纵向优先走 placement 指定的那侧；那侧放不下且对面更宽裕就翻过去。两边都不够时
 * 选宽裕的一侧，并用 maxHeight 把那侧的空间用满——面板自带 overflowY: auto，
 * 因此「放不下」的结果是内部滚动，而不是被裁或跑到画面外。
 * 横向按 align 靠左或靠右对齐，再整体推回视口内（窄窗口下宁可让面板压住锚点，
 * 也不让它越出右边缘——面板里的分类名会省略号收尾，读得下去）。
 */
export function popoverPosition({
  anchor, panel, viewport, align = 'right', placement = 'bottom',
  gap = POPOVER_GAP, margin = POPOVER_MARGIN,
}: {
  anchor: PopoverRect
  panel: PopoverBox
  viewport: PopoverBox
  align?: 'left' | 'right'
  placement?: 'bottom' | 'top'
  gap?: number
  margin?: number
}): { left: number; top: number; maxHeight: number } {
  const roomBelow = viewport.height - anchor.bottom - gap - margin
  const roomAbove = anchor.top - gap - margin
  const fits = (room: number) => panel.height <= room
  const useBottom = placement === 'bottom'
    ? (fits(roomBelow) || roomBelow >= roomAbove)
    : !(fits(roomAbove) || roomAbove > roomBelow)

  const maxHeight = Math.max(0, Math.min(
    panel.height,
    viewport.height * POPOVER_MAX_HEIGHT_RATIO,
    useBottom ? roomBelow : roomAbove,
  ))
  // 定位用的高度就是收口后的真实高度：maxHeight 由调用方原样套到面板上，两者必须同一个数，
  // 否则「向上展开」的面板会按未收口的高度往上让位，与锚点之间空出一段。
  const height = Math.min(panel.height, maxHeight)
  const top = useBottom
    ? Math.min(anchor.bottom + gap, viewport.height - margin - height)
    : Math.max(margin, anchor.top - gap - height)

  const left = Math.max(margin, Math.min(
    align === 'left' ? anchor.left : anchor.right - panel.width,
    viewport.width - margin - panel.width,
  ))

  return { left, top, maxHeight }
}

export default function CategoryPickerPopover({ anchor, onPick, onClose, align = 'right', placement = 'bottom' }: {
  /** 面板贴着哪个元素落位。三处调用点都传自己那颗「＋」按钮（或它所在的紧贴容器）。 */
  anchor: HTMLElement | null
  onPick: (categoryId: string) => void
  onClose: () => void
  /** 横向靠哪边对齐；纵向优先往哪边开。两者都只是**首选**，放不下时由 popoverPosition 改判。 */
  align?: 'left' | 'right'
  placement?: 'bottom' | 'top'
}) {
  const categories = useCategoryStore(s => s.categories)
  const wordCategoryMap = useCategoryStore(s => s.wordCategoryMap)
  const openEditor = useUiStore(s => s.openEditor)
  const panelRef = useRef<HTMLDivElement>(null)
  // null = 还没量到（首帧以 visibility: hidden 渲染，量完再落位），避免面板先闪在左上角再跳走
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null)

  useLayoutEffect(() => {
    if (!anchor) return
    const place = () => {
      const el = panelRef.current
      if (!el) return
      const r = anchor.getBoundingClientRect()
      const next = popoverPosition({
        anchor: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
        panel: { width: el.offsetWidth, height: el.offsetHeight },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        align, placement,
      })
      // 值没变就不落新对象：这三条监听在滚动时按帧触发，无谓的 setState 会让面板每帧重渲染
      setPos(prev => prev && prev.left === next.left && prev.top === next.top && prev.maxHeight === next.maxHeight ? prev : next)
    }
    place()
    // 面板已脱离祖先的裁剪，锚点却会随滚动 / 窗口改宽而移动，所以重算得由这几条触发。
    // scroll 用 capture 阶段才能收到内层滚动容器（侧栏词表、词典页 <main>）的滚动。
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor, align, placement])

  // 「分类 → 成员词数」：wordCategoryMap 反向聚合。一次遍历建完整张表（而非在 map 里
  // 每行扫一遍全表——那是 O(词数 × 分类数)），键用 Set 保证一个词在同一个分类下
  // 重复登记也只算一个；本仓不产生重复行，Set 只是让这个数上界正确。
  const memberCounts = useMemo(() => {
    const counts = new Map<string, Set<string>>()
    for (const [wordId, catIds] of Object.entries(wordCategoryMap)) {
      for (const cid of catIds) {
        let set = counts.get(cid)
        if (!set) { set = new Set(); counts.set(cid, set) }
        set.add(wordId)
      }
    }
    return new Map([...counts].map(([cid, set]) => [cid, set.size]))
  }, [wordCategoryMap])

  return (
    <>
      {/* 点外面关闭：全屏透明遮罩，fixed + 独立 z-index（比面板低一层）。
          面板是它的兄弟节点而非子节点，所以点面板本身不会冒泡到这里；点面板外任意处则命中遮罩。 */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-dropdown)' }}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="menu"
        style={{
          position: 'fixed',
          zIndex: 'calc(var(--z-dropdown) + 1)',
          left: pos ? pos.left : 0,
          top: pos ? pos.top : 0,
          // 首帧先隐形量尺寸：不先量就落位，面板会从左上角跳到锚点旁。
          // 这一帧**不能**把高度压成 0——量出来就是 0，落点会按高度 0 算。
          visibility: pos ? 'visible' : 'hidden',
          // 落位后上限由 popoverPosition 给（那一侧放得下多少就是多少）；首帧先用同一个
          // 视口比例兜住（与该函数里的 POPOVER_MAX_HEIGHT_RATIO 是同一个数，故量到的
          // 高度与它假设的高度一致）。超出部分内部滚动，不靠祖先裁剪。
          maxHeight: pos ? pos.maxHeight : `${POPOVER_MAX_HEIGHT_RATIO * 100}vh`, overflowY: 'auto',
          width: '220px', maxWidth: `calc(100vw - ${POPOVER_MARGIN * 2}px)`, boxSizing: 'border-box',
          padding: '6px',
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-overlay)',
        }}
      >
        {categories.length === 0 ? (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', padding: '6px 9px' }}>
            还没有分类
          </div>
        ) : categories.map(cat => (
          <button
            key={cat.id}
            type="button"
            role="menuitem"
            onClick={() => onPick(cat.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '9px', width: '100%',
              padding: '7px 9px', border: 'none', background: 'transparent', borderRadius: 'var(--radius-md)',
              cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {cat.name}
            </span>
            {/* 词数是行内的补充读数，不是统计量：走三级灰 + 与正文同字号，不套 .stat-num
                （那套等宽+主色+半粗是给统计数字的，见 index.css）。名可省略，数不省略。 */}
            <span style={{ flexShrink: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              {memberCounts.get(cat.id) ?? 0}
            </span>
          </button>
        ))}
        <div style={{ height: 1, background: 'var(--color-border)', margin: '4px 6px' }} />
        <button
          type="button"
          onClick={() => { onClose(); openEditor(null, null) }}
          style={{
            display: 'flex', alignItems: 'center', gap: '9px', width: '100%',
            padding: '7px 9px', border: 'none', background: 'transparent', borderRadius: 'var(--radius-md)',
            cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
            color: 'var(--color-text-secondary)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-surface-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          <span style={{ width: 10, textAlign: 'center' }}><Icon name="plus" size={10} /></span>
          新建分类
        </button>
      </div>
    </>
  )
}
