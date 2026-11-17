import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useViewStore } from '../../../stores/viewStore'
import { useWordStore } from '../../../stores/wordStore'
import { useUiStore } from '../../../stores/uiStore'
import { useWorkbenchNavigation } from '../../../lib/useWorkbenchNavigation'
import { moveConfirmRequest, moveTarget, moveActionLabel } from '../../../lib/archiveMove'
import { deleteWordConfirmRequest } from '../../../lib/wordActions'
import { appBarMenuItems } from '../../../lib/mobileSheets'
import Icon from '../../icons'
import SquareButton from '../../ui/SquareButton'
import MobileActionSheet from './MobileActionSheet'

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
 * 手机顶栏（Task 5，spec §4.1；Task 12 改）：抽屉、返回 / 前进、标题、⋯。
 *
 * - 返回 / 前进走 `useWorkbenchNavigation`——与桌面 `WorkbenchNavBar` 共用同一份
 *   「先切模块 → 再切数据集 → 最后选词」的实现（Task 5 抽出），两处入口顺序不可能分家。
 * - 「编者」按钮已撤（v0.7.7 Task 12，spec §3.8）：`editorMode` 在手机上只剩「显示来源色」
 *   一个语义，开关收进 ⋯ 表的第一项（`appBarMenuItems`）。桌面 `WorkbenchNavBar` 不受影响。
 * - ⋯ 打开的是 `MobileActionSheet`（Task 3），不再是桌面那枚 `ContextMenu`：手机上所有
 *   「长按 / ⋯ 弹出的表」都走同一张底部表。条目来自 `appBarMenuItems`——首项来源色开关，
 *   有选中词时再接移动 / 删除。没有选中词也出 ⋯（否则来源色开关无处可去，Ruling 3）。
 * - 移动复用 `lib/archiveMove` 的文案与 `useWordStore` 的 `moveToArchive` / `moveToWorkspace`，
 *   删除复用 `useWordStore.deleteWord` 与同一句确认文案（`WordWorkbench.handleDelete` 的逐字副本
 *   ——两处都在「当前选中词」上操作，动作与确认文案必须一致，故确认文案抽成
 *   `src/lib/wordActions.ts` 一份、两处共用）。
 * - 编辑态（`editing` 有值）时右端整簇换成「取消 / 保存」——与桌面 `WorkbenchNavBar` 的
 *   「编者 / 删除」换成「保存 / 取消」是同一个约定。
 *
 * 详情态（词典页）不出 ⋯：见下方 `dictOpen` 的注释。
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
  // ⋯ 表的开关（Task 12）：表自己登记安卓返回键；关闭一律把状态清回 false。
  const [menuOpen, setMenuOpen] = useState(false)

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

  // 表的条目由纯函数给出（首项来源色开关，有选中词再接移动 / 删除）。
  const menuItems = appBarMenuItems({
    sourceColorsOn: editorMode,
    moveLabel: moveActionLabel(location),
    hasWord: !!selectedWord,
  })

  // 三个分支都先关表再执行：确认框由 `uiStore.confirm` 自己弹，不依赖本表还在。
  const handleMenuPick = (key: string) => {
    setMenuOpen(false)
    if (key === 'sourceColors') { setEditorMode(!editorMode); return }
    if (key === 'move') { void onMove(); return }
    if (key === 'delete') { void onDelete(); return }
  }

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
      <button type="button" id="mobile-drawer-open" aria-label="词库" onClick={onOpenDrawer} style={iconBtn()}>
        <Icon name="layers" size={18} />
      </button>
      <button type="button" aria-label="上一个词条" disabled={!historyBack} onClick={goBack} style={iconBtn(!historyBack)}>
        <Icon name="arrow-left" size={17} />
      </button>
      <button type="button" aria-label="下一个词条" disabled={!historyForward} onClick={goForward} style={iconBtn(!historyForward)}>
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
          // `data-edit-keep`（v0.7.8 Task 6）：未保存确认的捕获阶段点击拦截按它放行——
          // 保存 / 取消本身绝不能先被拦掉（取消的确认走它自己的 `cancelEdit`）。
          // 内层 span 复刻父级的 gap: 2，包一层不改变两枚按钮的间距。
          <span data-edit-keep style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {/* 编辑态（Plan 2 的行内编辑）：与桌面 `WorkbenchNavBar` 同一约定——右端整簇换成
                「取消 / 保存」，⋯ 让位（编辑中不该还能删词条或切来源色）。
                `size="touch"` 是 `SquareButton` 为手机外壳新开的触屏档：与 `nav` 同形，
                只把高度提到 32（spec §10 的「沿用 size="nav" 配方，手机把高度调到约 32dp」）。
                桌面那对仍是 `nav` 的 22px，两档互不牵动。 */}
            <SquareButton size="touch" tone="canvas" onClick={() => onCancelEdit?.()}>
              取消
            </SquareButton>
            <SquareButton size="touch" tone="canvas" onClick={() => onSaveEdit?.()}>
              保存
            </SquareButton>
          </span>
        ) : (
          // ⋯ 只在非详情态出现：详情页的内容不是选中词的页面，而表里的移动 / 删除都作用在
          // 选中词上（见上方 `dictOpen` 的注释）。**没有选中词也出现**——来源色开关不依赖选中词
          // （Ruling 3），此时表里只有它一项。
          !dictOpen && (
            <button
              type="button"
              aria-label="更多操作"
              onClick={() => setMenuOpen(true)}
              style={iconBtn()}
            >
              <Icon name="more" size={18} />
            </button>
          )
        )}
      </div>

      {/* ⋯ 表（Task 12）：与手机上其余所有「长按 / ⋯」同一张 `MobileActionSheet`，
          返回键 / 点遮罩 / 取消三条关闭路径都由它自己登记，`onCancel` 只负责清状态。 */}
      <MobileActionSheet
        open={menuOpen && !dictOpen}
        title="更多操作"
        items={menuItems}
        onPick={handleMenuPick}
        onCancel={() => setMenuOpen(false)}
      />
    </header>
  )
}
