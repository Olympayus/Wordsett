import { useEffect } from 'react'
import { useViewStore } from '../../../stores/viewStore'
import WordWorkbench from '../../word/WordWorkbench'
import DictDetailPanel from '../../search/DictDetailPanel'
import ReviewModule from '../../review/ReviewModule'
import EmptyState from '../../ui/EmptyState'
import { useWordStore } from '../../../stores/wordStore'
import { NAV_HEIGHT } from '../../../lib/layout'

// 手机外壳骨架（Task 4）。
//
// **本任务只立骨架**：顶栏 / 底栏是占位（Task 5 换成 `MobileAppBar` / `MobileTabBar` /
// `WordStrip`），搜索模块与设置页也先占位（Task 7 / Task 9 才落页面）。骨架先把三件事钉住：
//   ① 整树 `h-screen` + 纵向 flex，内容区 `flex-1` 且 `overflow: hidden`；
//   ② 词条渲染**只走 `WordWorkbench`**（含 `DictDetailPanel`），不复制任何正文渲染；
//   ③ 工作台在手机上不带桌面导航条——`WordWorkbench` 收到 `chrome="mobile"`，动作归 `MobileAppBar`。
//
// 面与线只取既有 token（`--color-chrome` / `--color-canvas`），本任务不新增任何色值。

/** 模块 → 内容根标记。与 `AppShell` 同判据（`FindBar` 按 `data-find-root` 取当前模块的搜索根）。 */
function findRoot(module: string): string {
  return module === 'archive' ? 'archive' : module
}

/** 占位底栏的中文标签（Task 5 的 `MobileTabBar` 用 `MOBILE_TABS` 的 icon + label，这里只有文字）。 */
const TAB_LABELS: Record<string, string> = {
  workbench: '工作台',
  archive: '储藏库',
  search: '搜索',
  review: '复习',
  settings: '设置',
}
const TAB_KEYS = ['workbench', 'archive', 'search', 'review', 'settings'] as const

export default function MobileShell() {
  const activeModule = useViewStore(s => s.activeModule)
  const activeView = useViewStore(s => s.activeView)
  const dictWord = useViewStore(s => s.dictWord)
  const showModule = useViewStore(s => s.showModule)

  // 模块 ↔ 数据集的耦合：与 `AppShell` 同一份判据（工作台取工作区词表，储藏库取储藏库词表）。
  // 两处各写一遍是刻意的——`AppShell` 与 `MobileShell` 的模块分发本就是两套，而 `viewStore`
  // 不能反过来依赖 `wordStore`（会成环）。`location` 已经对了就跳过：链接跳转先 `showModule`
  // 再自己 `await setLocation`，本 effect 后跑到时再设一次会二次加载词表、清掉刚选中的词。
  useEffect(() => {
    if (activeModule !== 'workbench' && activeModule !== 'archive') return
    const target = activeModule === 'archive' ? 'archive' : 'workspace'
    if (useWordStore.getState().location !== target) void useWordStore.getState().setLocation(target)
  }, [activeModule])

  // 占位底栏的跳转（Task 2 的 `MOBILE_TABS` 那五格）。搜索走 `openSearch`——它保存来源模块
  // 与视图，`closeSearch` 据此回到来源（Task 2）；复习 / 设置是普通模块切换。
  const tabClick = (key: string) => {
    if (key === 'search') { useViewStore.getState().openSearch(); return }
    if (key === 'review' || key === 'settings') showModule(key)
  }

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--color-canvas)' }}>
      {/* 顶栏占位（Task 5 换成 `MobileAppBar`：抽屉 / 返回前进 / 标题 / 色条开关 / ⋯） */}
      <header
        className="shrink-0 flex items-center justify-center"
        style={{
          height: `${NAV_HEIGHT}px`,
          background: 'var(--color-chrome)',
          borderBottom: '1px solid var(--color-border)',
          // 状态栏（挖孔屏 / 刘海）之下：安全区内边距只加在顶栏与底栏上，内容区不再叠加
          paddingTop: 'env(safe-area-inset-top)',
        }}
      >
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-sans)' }}>
          顶栏占位
        </span>
      </header>

      {/* 内容区：`data-find-root` 供 `FindBar` 定位当前模块的搜索根（与 `AppShell` 同名属性）。
          高度由 `flex-1` + `minHeight: 0` 决定——不写死高度，Task 5 再往里加词条条。 */}
      <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
        {activeModule === 'workbench' || activeModule === 'archive' ? (
          <main
            data-find-root={findRoot(activeModule)}
            className="flex-1 overflow-hidden"
            style={{ background: 'var(--color-canvas)' }}
          >
            {/* 词典详情视图：手机端与工作台同一层（`AppShell` 也是这一层），
                故手机外壳不复制 `WordList`——词条列表由 `MobileAppBar` 的抽屉承担（Task 5）。 */}
            {activeView === 'dict' && dictWord
              ? <DictDetailPanel word={dictWord} />
              : <WordWorkbench chrome="mobile" />}
          </main>
        ) : activeModule === 'review' ? (
          /* 复习模块：**原样复用桌面布局**（Plan 3 再改移动版），故不额外包内容根——
             它的吸顶层（ArenaNavBar + 进度条）自带 `background` 与 `sticky`。 */
          <main data-find-root="review" className="flex-1 overflow-hidden" style={{ background: 'var(--color-canvas)' }}>
            <ReviewModule />
          </main>
        ) : (
          /* 搜索模块（Task 7 落 `MobileSearchPage`）与设置页（Task 9）先占位。
             搜索模块在手机上不能渲染桌面 `WordWorkbench`：那会显示**来源模块**的词表，
             与「搜索」这一格完全无关。 */
          <main
            data-find-root={activeModule}
            className="flex-1 overflow-auto"
            style={{ background: 'var(--color-canvas)', minWidth: 0 }}
          >
            <EmptyState message={activeModule === 'search' ? '搜索模块即将上线' : '设置页即将上线'} />
          </main>
        )}
      </div>

      {/* 底栏占位（Task 5 换成 `MobileTabBar`：五格 + 中间凸起的搜索圆钮 + 复习到期徽标） */}
      <nav
        aria-label="模块"
        className="shrink-0 flex items-center justify-around"
        style={{
          height: `${NAV_HEIGHT}px`,
          background: 'var(--color-chrome)',
          borderTop: '1px solid var(--color-border)',
          // 手势条（Android 手势导航）之上：底栏高度不含它，故这里补上
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {TAB_KEYS.map(key => (
          <button
            key={key}
            type="button"
            onClick={() => tabClick(key)}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              padding: '0 12px', fontSize: 12, fontFamily: 'var(--font-sans)',
              color: activeModule === key ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              fontWeight: activeModule === key ? 600 : 400,
            }}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </nav>
    </div>
  )
}
