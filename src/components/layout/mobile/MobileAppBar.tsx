import { useCallback, useState } from 'react'
import type { CSSProperties } from 'react'
import { useViewStore } from '../../../stores/viewStore'
import { useWordStore } from '../../../stores/wordStore'
import { useUiStore } from '../../../stores/uiStore'
import { useWorkbenchNavigation } from '../../../lib/useWorkbenchNavigation'
import { moveConfirmRequest, moveTarget, moveActionLabel } from '../../../lib/archiveMove'
import { deleteWordConfirmRequest } from '../../../lib/wordActions'
import Icon from '../../icons'
import SquareButton from '../../ui/SquareButton'
import ContextMenu, { type MenuItem } from '../../ui/ContextMenu'
import { useMobilePopup } from '../../../lib/mobilePopups'

/** 顶栏高度（spec §4.1：约 52dp）。不含状态栏——刘海 / 挖孔由 `paddingTop` 的安全区另加。 */
const BAR_HEIGHT = 52
/** 顶栏里控件的高度：桌面导航条的 22px 在手机上不够点，提到 32（比 28 大一档）。
 *  离 spec §10 的 44dp 命中区还差一截——外扩透明命中区归 Plan 2（触摸编辑 / 命中区），
 *  这一版先把控件本身与控件间距撑开。 */
const CONTROL = 32

/**
 * 无边框无底色的图标键（手机顶栏）：hover 才起底色，与桌面 `WorkbenchNavBar` 的 `nav-btn` 同形。
 * 32px 高于既有 28px，命中区由左簇到右簇之间保证（间距 2–6px）。
 */
const iconBtn = (disabled = false): CSSProperties => ({
  width: `${CONTROL}px`, height: `${CONTROL}px`, flexShrink: 0,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  border: 'none', background: 'transparent', borderRadius: 'var(--radius-md)',
  cursor: disabled ? 'default' : 'pointer',
  color: 'var(--color-text-secondary)',
  opacity: disabled ? 0.3 : 1,
  transition: 'background-color var(--duration-fast) var(--ease-smooth), color var(--duration-fast) var(--ease-smooth)',
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
})

/** ⋯ 菜单的浮层落位：直接以点击处为锚，由 `ContextMenu` 钳进视口（与桌面行尾 ⋯ 同一配方）。 */
const MENU_ANCHOR_OFFSET = 8

interface Props {
  /** 打开左侧抽屉（Task 6 的 `MobileDrawer`，由 `MobileShell` 接线）。 */
  onOpenDrawer: () => void
  /** 有东西正在编辑时换成「取消 / 保存」——与桌面 `WorkbenchNavBar`
   *  的 `editing` prop 同一形状：有值才出现。 */
  editing?: { dirty: boolean }
  onSaveEdit?: () => void
  onCancelEdit?: () => void
}

/**
 * 手机顶栏（Task 5，spec §4.1）：抽屉、返回 / 前进、标题、「色条」开关、⋯。
 *
 * - 返回 / 前进走 `useWorkbenchNavigation`——与桌面 `WorkbenchNavBar` 共用同一份
 *   「先切模块 → 再切数据集 → 最后选词」的实现（Task 5 抽出），两处入口顺序不可能分家。
 * - 「色条」开关是 `useViewStore.editorMode`（编者模式）的形态开关：`SquareButton` 的
 *   `pressed` 配方与桌面 `WorkbenchNavBar` 同一套（含 `role="switch"` + `aria-checked`
 *   与品牌蓝浅一阶底），尺寸取 `size="touch"`——`SquareButton` 为手机外壳开的触屏档，
 *   与 `nav` 同形、只把高度从 22 提到 32（spec §10）。于是它与左右两枚 32px 箭头键
 *   逐像素等高，右端簇读起来是同一排控件。
 * - ⋯ 里两件动作与桌面工作台**同一批调用**：移动复用 `lib/archiveMove` 的文案与
 *   `useWordStore` 的 `moveToArchive` / `moveToWorkspace`，删除复用 `useWordStore.deleteWord`
 *   与同一句确认文案（`WordWorkbench.handleDelete` 的逐字副本——两处都在「当前选中词」上操作，
 *   动作与确认文案必须一致，故确认文案抽成 `src/lib/wordActions.ts` 一份、两处共用）。
 * - 编辑态（`editing` 有值）时右端整簇换成「取消 / 保存」——与桌面 `WorkbenchNavBar` 的
 *   「编者 / 删除」换成「保存 / 取消」是同一个约定。
 *
 * 只有存在选中词时才出 ⋯ 与移动项：没有选中词，移动 / 删除都没有宾语。
 */
export default function MobileAppBar({ onOpenDrawer, editing, onSaveEdit, onCancelEdit }: Props) {
  const { words, selectedWordId, location, moveToArchive, moveToWorkspace, deleteWord } = useWordStore()
  const editorMode = useViewStore(s => s.editorMode)
  const setEditorMode = useViewStore(s => s.setEditorMode)
  const { canBack, canForward, goBack, goForward } = useWorkbenchNavigation()

  const selectedWord = words.find(w => w.id === selectedWordId)
  // 详情态（工作台 / 储藏库里的词典页）：标题要跟**正在读的那页**走，`⋯` 则要收起来。
  // 两者都必须这样：`showDict` 只换视图与 dictWord，不动侧栏选中项——从 `{{链接}}` 跳进来的
  // 词典词可能**不是**当前选中词，照旧画选中词的标题会张冠李戴，而 `⋯` 的删除 / 移库
  // 会作用在选中词上（用户看到的是一页词、删掉的却是另一个）。删除 / 移库在详情页没有入口，
  // 桌面返回页也没有——要操作那个词，先在侧栏里选中它。
  const activeView = useViewStore(s => s.activeView)
  const dictWord = useViewStore(s => s.dictWord)
  const dictOpen = activeView === 'dict' && !!dictWord
  const title = dictOpen
    ? dictWord
    : selectedWord
      ? selectedWord.lemma
      : location === 'archive' ? '储藏库' : '工作台'
  // ⋯ 菜单的锚点（`ContextMenu` 按点击处落位并钳进视口）
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  // 菜单开着时登记给外壳：安卓返回键先关菜单，而不是穿透出去换词 / 退出应用
  // （`ContextMenu` 只听 window 的 Escape，而安卓返回不经 DOM）。
  useMobilePopup(menu !== null, closeMenu)

  // 详情态下收起返回 / 前进：`go` 只切模块 → 数据集 → 选中词，**不动 activeView**
  // （`useWorkbenchNavigation`），所以在词典页按它会把模块与高亮悄悄换走、正文却留在原处
  // ——与词片补 `showWorkbenchView` 之前是同一个 bug。详情页自己的返回在底部动作条的
  // 面包屑上，历史导航在详情态没有清晰的语义，索性禁用而不是猜一个。
  const historyBack = canBack && !dictOpen
  const historyForward = canForward && !dictOpen

  // 两件动作：都先弹与桌面同一句确认，再走 `useWordStore` 的既有 action（不自己写 SQL）。
  const onMove = async () => {
    if (!selectedWord) return
    const to = moveTarget(location)
    const ok = await useUiStore.getState().confirm(moveConfirmRequest(to, selectedWord.lemma))
    if (!ok) return
    if (to === 'archive') await moveToArchive(selectedWord.id)
    else await moveToWorkspace(selectedWord.id)
  }

  const onDelete = async () => {
    if (!selectedWord) return
    const ok = await useUiStore.getState().confirm(deleteWordConfirmRequest(selectedWord.lemma))
    if (!ok) return
    await deleteWord(selectedWord.id)
  }

  const menuItems: MenuItem[] = [
    { key: 'move', label: moveActionLabel(location), onSelect: () => { void onMove() } },
    { key: 'delete', label: '删除词条', danger: true, onSelect: () => { void onDelete() } },
  ]

  return (
    <header
      className="shrink-0 flex items-center"
      style={{
        // **高度含安全区**：与底栏同一条理由——`box-sizing: border-box` 下 `height` 是含内边距
        // 的尺寸，把 `env(safe-area-inset-top)` 写进 `paddingTop` 会把内容盒从 52px 压小、
        // 让 52px 的控件溢出顶栏、压到状态栏（挖孔 / 刘海）上。加进 `height` 则内容盒仍是 52px。
        height: `calc(${BAR_HEIGHT}px + env(safe-area-inset-top))`, gap: 2, padding: '0 8px',
        background: 'var(--color-chrome)',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      {/* 抽屉钮带 id：抽屉关闭时焦点还回这里（`MobileDrawer` 的 effect 按这个名字找）。
          一个稳定的 id 比 ref 转发短——抽屉不必认识顶栏。 */}
      <button type="button" id="mobile-drawer-open" title="词库" aria-label="词库" onClick={onOpenDrawer} style={iconBtn()}>
        <Icon name="layers" size={18} />
      </button>
      <button type="button" title="上一个词条" aria-label="上一个词条" disabled={!historyBack} onClick={goBack} style={iconBtn(!historyBack)}>
        <Icon name="arrow-left" size={17} />
      </button>
      <button type="button" title="下一个词条" aria-label="下一个词条" disabled={!historyForward} onClick={goForward} style={iconBtn(!historyForward)}>
        <Icon name="arrow-right" size={17} />
      </button>

      {/* 标题：有选中词就是词面，没有就是模块名。`minWidth: 0` + 省略号——长词不撑破顶栏 */}
      <div
        aria-live="polite"
        style={{
          flex: '1 1 auto', minWidth: 0, margin: '0 2px',
          fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 600,
          color: 'var(--color-text-primary)', lineHeight: 1.2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {title}
      </div>

      {/* 右端簇 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        {editing ? (
          <>
            {/* 编辑态（Plan 2 的行内编辑）：与桌面 `WorkbenchNavBar` 同一约定——右端整簇换成
                「取消 / 保存」，色条开关与 ⋯ 都让位（编辑中不该还能切形态开关或删除词条）。
                `size="touch"` 是 `SquareButton` 为手机外壳新开的触屏档：与 `nav` 同形，
                只把高度提到 32（spec §10 的「沿用 size="nav" 配方，手机把高度调到约 32dp」）。
                桌面那对仍是 `nav` 的 22px，两档互不牵动。 */}
            <SquareButton size="touch" tone="canvas" onClick={() => onCancelEdit?.()}>
              取消
            </SquareButton>
            <SquareButton size="touch" tone="canvas" onClick={() => onSaveEdit?.()}>
              保存
            </SquareButton>
          </>
        ) : (
          <>
            {/* 编者模式（「色条」）：形态开关，开 = 品牌蓝浅一阶 + 深字。`SquareButton` 的
                `pressed` 配方与桌面 `WorkbenchNavBar` 同一套（`role="switch"` + `aria-checked`），
                高度同样走 `touch` 档——与左右两枚 32px 箭头键逐像素等高，右端簇才不歪。 */}
            <SquareButton
              size="touch"
              tone="canvas"
              pressed={editorMode}
              role="switch"
              aria-checked={editorMode}
              aria-label="色条"
              title="色条"
              onClick={() => setEditorMode(!editorMode)}
            >
              色条
            </SquareButton>
            {/* ⋯ 里两件动作：移入 / 移出储藏库、删除词条（与桌面工作台同一批调用，见组件头注释）。
                没有选中词时整枚不出——移动与删除都没有宾语；详情态下也不出——见上方 `dictOpen`
                的注释（那时内容不是选中词的页面）。 */}
            {selectedWord && !dictOpen && (
              <button
                type="button"
                title="更多操作"
                aria-label="更多操作"
                onClick={e => setMenu({ x: e.clientX, y: e.clientY + MENU_ANCHOR_OFFSET })}
                style={iconBtn()}
              >
                <Icon name="more" size={18} />
              </button>
            )}
          </>
        )}
      </div>

      {/* ⋯ 菜单：fixed 落位、点外 / Esc 自关（`ContextMenu` 自带），与桌面行尾 ⋯ 同一组件 */}
      {menu && selectedWord && !dictOpen && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={closeMenu} />
      )}
    </header>
  )
}
