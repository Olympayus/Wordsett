import { useEffect, useRef, useState, useCallback } from 'react'
import { useViewStore } from '../../../stores/viewStore'
import WordWorkbench, { type WordWorkbenchHandle } from '../../word/WordWorkbench'
import DictDetailPanel from '../../search/DictDetailPanel'
import MobileSearchPage from '../../search/MobileSearchPage'
import ReviewModule from '../../review/ReviewModule'
import SettingsPage from '../../settings/SettingsPage'
import MobileAppBar from './MobileAppBar'
import MobileTabBar from './MobileTabBar'
import WordStrip from './WordStrip'
import MobileDrawer from './MobileDrawer'
import { useWordStore } from '../../../stores/wordStore'
import type { SettingsSectionKey } from '../../../lib/mobileSettings'
import { useReviewSessionStore } from '../../../stores/reviewSessionStore'
import { hideMobileTabBar } from '../../../lib/mobileTabBar'
import { useUiStore } from '../../../stores/uiStore'
import CategoryAssignModal from '../../word/CategoryAssignModal'
import CategoryEditorModal from '../../word/CategoryEditorModal'
import ConfirmDialog from '../../ui/ConfirmDialog'
import { useAndroidBackStack } from '../useAndroidBackStack'

// 手机外壳（Task 4 立骨架，Task 5 填三块）。
//
// 结构（spec §4.1 / §4.3）：顶栏（52dp）→ 词条条（横向滚动，只有词片）→ 内容区 → 底栏（62dp）。
// 四块**全部常显**——本版不做滚动显隐（spec §4.2），顶栏 / 词条条 / 底栏都只在模块切换时换内容。
//
// 词条渲染**只走 `WordWorkbench`**（含 `DictDetailPanel`），不复制任何正文渲染；
// 工作台在手机上不带桌面导航条——`WordWorkbench` 收到 `chrome="mobile"`，动作归 `MobileAppBar`。
//
// 面与线只取既有 token（`--color-chrome` / `--color-canvas`），本任务不新增任何色值。

/** 模块 → 内容根标记。与 `AppShell` 同判据（`FindBar` 按 `data-find-root` 取当前模块的搜索根）。 */
function findRoot(module: string): string {
  return module === 'archive' ? 'archive' : module
}

/**
 * 词条页的编辑态：有正在编辑的字段（`editingId`）且值真的改过（`hasFieldChanges`）。
 *
 * 这个状态**只存在于 `WordWorkbench` 内部**（`editingId` / `editValue` / `entryValue` 三件都是
 * 它的局部 state），而「取消 / 保存」要画在顶栏，故由它经 `onEditStateChange` 上报给外壳。
 * 判据与桌面导航条逐字一致：`editing` 有值才出现，`dirty` 只作将来的「未保存」提示、
 * 不据此禁用按钮（见 `WorkbenchNavBar` 的 prop 注释）。
 *
 * 上报走 `useEffect` 而不是渲染期 setState：渲染期 setState 会让 `WordWorkbench` 的每次
 * 按键都同步重挂外壳（含正在输入的那个输入框），代价落在最不该慢的一条路径上。
 */
interface EditState { dirty: boolean }

export default function MobileShell() {
  const activeModule = useViewStore(s => s.activeModule)
  const activeView = useViewStore(s => s.activeView)
  const dictWord = useViewStore(s => s.dictWord)
  // 词典详情是否打开（v0.7.10）：详情面板的渲染与底栏显隐**共用这一条判据**。
  // 两处各算，日后改一处漏一处就会出现「面板开着、底栏也开着」（动作条整条盖住底栏）
  // 或反过来。`dictWord` 非空才算出详情——`activeView` 可能停在上一个词的残留上。
  const dictOpen = activeView === 'dict' && !!dictWord
  // 复习会话态（v0.7.6 沉浸态）：答题进行中收起底栏，判据在 `mobileTabBar`。
  // 两个字段分开订阅：底栏显隐只跟它们走，答题中 `index` / `answered` / `queue` 的
  // 每次变化都不该顺带重渲整棵手机外壳。
  const reviewPhase = useReviewSessionStore(s => s.phase)
  const reviewSessionStrategy = useReviewSessionStore(s => s.sessionStrategy)
  // 词条页的编辑态（由 `WordWorkbench` 上报，见上方 `EditState`）
  const [editing, setEditing] = useState<EditState | null>(null)
  // 保存 / 取消：编辑态归 `WordWorkbench` 所有（`editingId` / `editValue` 都在它体内），
  // 故这两件经它的 `ref` 调用。外壳只持有「谁在编辑」这个状态，不复制保存 / 取消的逻辑。
  const workbenchRef = useRef<WordWorkbenchHandle>(null)
  const saveEdit = () => { workbenchRef.current?.saveEdit() }
  const cancelEdit = () => { workbenchRef.current?.cancelEdit() }

  // 模块 ↔ 数据集的耦合：与 `AppShell` 同一份判据（工作台取工作区词表，储藏库取储藏库词表）。
  // 两处各写一遍是刻意的——`AppShell` 与 `MobileShell` 的模块分发本就是两套，而 `viewStore`
  // 不能反过来依赖 `wordStore`（会成环）。`location` 已经对了就跳过：链接跳转先 `showModule`
  // 再自己 `await setLocation`，本 effect 后跑到时再设一次会二次加载词表、清掉刚选中的词。
  useEffect(() => {
    if (activeModule !== 'workbench' && activeModule !== 'archive') return
    const target = activeModule === 'archive' ? 'archive' : 'workspace'
    if (useWordStore.getState().location !== target) void useWordStore.getState().setLocation(target)
  }, [activeModule])

  // 抽屉（Task 6 的 `MobileDrawer`）：开关是外壳自己的瞬时 state，只有词条页（工作台 / 储藏库）
  // 有入口（顶栏那枚按钮只在那里出现）。抽屉**常挂**，关闭只是隐藏——滚动位置与选择模式
  // 因此活过一次开合（spec §4.4）；工作台与储藏库各挂一份（见下方两处渲染），互不覆盖。
  const [drawerOpen, setDrawerOpen] = useState(false)
  const openDrawer = useCallback(() => setDrawerOpen(true), [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])

  // 离开词条页（复习 / 设置）时顺手把抽屉收起来：那两页没有抽屉入口，留一个开着的抽屉
  // 只会让「设置页看起来像被一块整屏词库面板压着」。抽屉自身保持挂载，滚动位置不受影响。
  useEffect(() => {
    if (activeModule === 'workbench' || activeModule === 'archive') return
    setDrawerOpen(false)
  }, [activeModule])

  // 设置页的「目录 → 子页」状态抬到外壳（Task 10 修复）：返回键要能看见它，
  // 否则在子页上按安卓返回会一路退到模块、甚至退出应用。`null` = 目录。
  const [settingsSection, setSettingsSection] = useState<SettingsSectionKey | null>(null)
  useEffect(() => {
    if (activeModule === 'settings') return
    setSettingsSection(null)
  }, [activeModule])

  const closeSettingsSub = useCallback(() => setSettingsSection(null), [])

  // ── 安卓返回栈（v0.7.10 Task 4 抽到 `useAndroidBackStack`）──────────────────────────────
  //
  // 订阅与全部前置检查（确认框 → 分类弹窗 → 自家浮层 → 层集合 → 动作分发）都在 hook 里，
  // 手机与平板共用同一份实现。本组件只交出**自己的**两个瞬时层与它们的关闭动作；
  // 其余层（详情 / 搜索 / 复习 / 导航）由 hook 在按下那一刻现读 store。
  useAndroidBackStack({
    editing: !!editing,
    drawerOpen,
    settingsSection,
    actions: { cancelEdit, closeDrawer, closeSettingsSub },
  })

  // 方向锁定（v0.7.8）：已上移到 `IndexPage`——外壳分发的唯一入口，手机 / 平板都要经过它。
  // 手机外壳不再自己调（平板复用桌面外壳，那条路径根本不会挂到这里，两处调用会漏掉平板）。

  // 全局浮层（Task 11）：与 `AppShell` 同一套 store 状态（`assignWordId` / `editorTarget`），
  // 少了它们手机上的分类分配与确认动作会「弹窗不出现、Promise 永不 resolve」。
  // **不挂 `UpdateDialog`**：Android 不启用 updater（spec §9），关于页只出手动安装说明。
  // 逐项 selector 而不是整个 store：后者会让任何浮层状态变化都重渲整棵手机树
  // （抽屉 + WordList + WordWorkbench + 底栏），手机的性能预算比桌面紧。
  const assignWordId = useUiStore(s => s.assignWordId)
  const editorTarget = useUiStore(s => s.editorTarget)
  const closeModals = useUiStore(s => s.closeModals)
  const openEditor = useUiStore(s => s.openEditor)

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--color-canvas)', position: 'relative' }}>
      {/* 顶栏：抽屉 / 返回前进 / 标题 / 编者开关 / ⋯（编辑态换成取消 / 保存）。
          只在词条页（工作台 / 储藏库）出现：搜索、复习、设置是各自的一级页面，
          顶部由各自的页面自己负责（spec §4.1「其余页面按各自导航需要出一枚返回与面包屑」）。 */}
      {(activeModule === 'workbench' || activeModule === 'archive') && (
        <MobileAppBar
          onOpenDrawer={openDrawer}
          editing={editing ?? undefined}
          onSaveEdit={saveEdit}
          onCancelEdit={cancelEdit}
        />
      )}

      {/* 内容区：`data-find-root` 与 `AppShell` 同名（标记当前模块的搜索根），手机上
          `FindBar` 不挂载，故它今天只是与桌面同一套 DOM 契约的一部分，不驱动任何行为。
          高度由 `flex-1` + `minHeight: 0` 决定——不写死高度。 */}
      <div
        className="flex-1 flex flex-col overflow-hidden"
        style={{ minHeight: 0 }}
      >
        {/* 词条条（spec §4.3 方案 B）：只在词条页出现；词库为空时它自己不渲染。 */}
        {(activeModule === 'workbench' || activeModule === 'archive') && <WordStrip />}

        {activeModule === 'workbench' || activeModule === 'archive' ? (
          <main
            data-find-root={findRoot(activeModule)}
            className="flex-1 overflow-hidden"
            style={{ background: 'var(--color-canvas)' }}
          >
            {/* 词典详情视图：手机端与工作台同一层（`AppShell` 也是这一层），
                故手机外壳不复制 `WordList`——词条列表由 `MobileAppBar` 的抽屉承担（Task 6）。
                Task 8：`variant="mobile"`——手机详情不渲染桌面导航条；返回 / 面包屑在搜索路径
                由详情页自己的顶栏出，工作台 / 储藏库路径落在底部固定动作条的顶面，
                「初始熟悉度 / 已选 / ＋ / 添加至…」都在那条底栏上。 */}
            {dictOpen
              ? <DictDetailPanel word={dictWord} variant="mobile" />
              : (
                <WordWorkbench
                  ref={workbenchRef}
                  chrome="mobile"
                  onEditStateChange={setEditing}
                />
              )}
          </main>
        ) : activeModule === 'review' ? (
          /* 复习模块：**原样复用桌面布局**（Plan 3 再改移动版），故不额外包内容根——
             它的吸顶层（ArenaNavBar + 进度条）自带 `background` 与 `sticky`。
             `display: flex` 不可省：`ReviewModule` 的根是 `flex-1`，它靠父级是 flex 容器
             才拿得到满高；`<main>` 缺省是块盒，`flex: 1` 无处生效，根节点缩成内容高，
             内部 `overflow-auto` 的右栏因此永远不会出现滚动条、超出一屏的部分被这里
             `overflow-hidden` 直接裁掉（手机上题目 / 解析一长就滚不到）。 */
          <main
            data-find-root="review"
            className="flex-1 overflow-hidden"
            style={{ background: 'var(--color-canvas)', display: 'flex', flexDirection: 'column', minHeight: 0 }}
          >
            <ReviewModule />
          </main>
        ) : activeModule === 'search' ? (
          /* 搜索模块（Task 7）：一级页面，自己出顶行（返回 + 输入 + 清除），
             与桌面顶栏无关。词典详情与工作台同一层（`AppShell` 也是这一层）。
             **MobileSearchPage 始终挂载**：它的 `query` 是局部 state，卸载即清零，
             返回后查询与建议词会全丢（spec §4.5）。详情态由页面自己整页 `display:none` 藏起来，
             详情面板照原样在上层渲染（Task 8 的 `variant="mobile"`）。 */
          <main data-find-root="search" className="flex-1 overflow-hidden" style={{ background: 'var(--color-canvas)', minWidth: 0 }}>
            <MobileSearchPage />
            {dictOpen && <DictDetailPanel word={dictWord} variant="mobile" />}
          </main>
        ) : (
          /* 设置模块（Task 9）：自己出「目录 → 子页」两态，故不渲染 `MobileAppBar`（它服务词条页）。
             `variant="mobile"` 让 `SettingsPage` 走手机形态：目录行 + 子页返回键；
             桌面双栏那套仍挂在 `AppShell` 下，两者共用同一份分区列表（`lib/mobileSettings.ts`）。 */
          <main data-find-root="settings" className="flex-1 overflow-hidden" style={{ background: 'var(--color-canvas)', minWidth: 0 }}>
            <SettingsPage
              variant="mobile"
              mobileSection={settingsSection}
              onMobileSectionChange={setSettingsSection}
            />
          </main>
        )}

      </div>

      {/* 抽屉（Task 6，spec §4.4；用户裁定改为**整块屏幕**）：挂在**外壳根**上而不是内容区里，
          故 `absolute inset-0` 覆盖顶栏 / 内容 / 底栏整屏（根节点因此带 `position: relative`）。
          只挂载在词条页——顶栏那枚入口按钮也只在那里出现。
          工作台与储藏库**同时挂载**（只有当前模块那份 `open`），切模块时另一份不卸载，
          于是各自的 `WordList` 滚动位置互不覆盖（spec §4.4「工作台与储藏库各自独立」）。
          代价是两份列表都在重渲；`open` 为假的那份整棵 `visibility: hidden` + `inert`。
          每份一个 key：React 不会在两处之间复用同一个 `WordList` 实例（那会带着上一模块的
          筛选 / 选中态）。 */}
      {(activeModule === 'workbench' || activeModule === 'archive') && (
        <>
          <MobileDrawer key="drawer-workbench" open={drawerOpen && activeModule === 'workbench'} onClose={closeDrawer} />
          <MobileDrawer key="drawer-archive" open={drawerOpen && activeModule === 'archive'} onClose={closeDrawer} />
        </>
      )}

      {/* 底栏：五格 + 中间的搜索圆钮 + 复习到期徽标。
          v0.7.6 沉浸态：复习会话进行中整条收起（判据见 `hideMobileTabBar`）——
          答题页自带一条随会话状态变化的底栏，两条同时出现会把答题区挤掉一截。
          v0.7.10：词典详情打开时也收起——详情页的 `MobileDictActionBar`（fixed，86px）
          会整条盖住底栏。判据 `dictOpen` 与上方详情面板的渲染条件是同一条表达式。 */}
      {!hideMobileTabBar(activeModule, reviewPhase, reviewSessionStrategy, dictOpen) && <MobileTabBar />}

      {/* 全局浮层（Task 11）：分类分配 / 新建分类 / 通用确认框。与 `AppShell` 的挂载方式一致，
          用同一份 `useUiStore` 状态；`UpdateDialog` 刻意不挂（Android 禁用 updater）。 */}
      <CategoryAssignModal
        open={!!assignWordId}
        wordId={assignWordId ?? ''}
        onClose={closeModals}
        onCreateNew={() => openEditor(null, assignWordId)}
        variant="mobile"
      />
      {editorTarget && (
        <CategoryEditorModal
          open={!!editorTarget}
          category={editorTarget.category}
          wordId={editorTarget.wordId ?? ''}
          onClose={closeModals}
          variant="mobile"
        />
      )}
      <ConfirmDialog variant="mobile" />
    </div>
  )
}
