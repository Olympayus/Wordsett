import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import TopBar from './TopBar'
import WordList from './WordList'
import SidebarFooter from './SidebarFooter'
import WordWorkbench, { type WordWorkbenchHandle } from '../word/WordWorkbench'
import DictDetailPanel from '../search/DictDetailPanel'
import { useWordStore } from '../../stores/wordStore'
import { useViewStore } from '../../stores/viewStore'
import SettingsPage from '../settings/SettingsPage'
import ReviewModule from '../review/ReviewModule'
import ActivityRail from './ActivityRail'
import { useSettingsStore } from '../../stores/settingsStore'
import { useUiStore } from '../../stores/uiStore'
import CategoryAssignModal from '../word/CategoryAssignModal'
import CategoryEditorModal from '../word/CategoryEditorModal'
import CollectBanner from './CollectBanner'
import UpdateDialog from '../ui/UpdateDialog'
import ConfirmDialog from '../ui/ConfirmDialog'
import FindBar, { registerFindKeyHandler } from '../ui/FindBar'
import { fitCollapsedWidth, measureMaxWordWidth, resolveSidebarWordFont, COLLAPSED_CHROME_ALPHABET, COLLAPSED_CHROME_CATEGORY, SIDEBAR_EXPANDED_WIDTH } from '../../lib/sidebar'
import { usePlatformClass, useTabletLayout } from '../../lib/usePlatform'
import { hasTouchSemantics, isAndroidTablet } from '../../lib/platform'
import { useMobileBackStack } from './useMobileBackStack'
import { useCloseRequest } from '../../lib/tray/useCloseRequest'
import { useQuitRequest } from '../../lib/useQuitRequest'

interface AppShellProps {
  /**
   * 平板（v0.7.8 Android / v0.8.0 iOS）：复用同一套三栏，但整棵树由 `IndexPage` 的缩放宿主包住。
   * 为真时根节点高度取 `100%`（撑满宿主补偿后的高度）而不是 `h-screen`（100vh 是屏幕高，
   * 缩放后会在底部留一条空白），侧栏展开宽度跟 `tabletLayout` 走（窄档 240）。
   */
  tablet?: boolean
}

/**
 * 平板返回栈（v0.7.10 Task 4）：`android-tablet` 才挂载。
 *
 * 桌面也渲染 `AppShell`，而 hook 不能在条件里调用，故用这个只负责条件挂载的空组件——
 * 平板没有抽屉与设置子页，传 `false` / `null`，那两层永远不会进栈，关闭动作也就不会到达。
 */
function TabletBackStack({ editing, cancelEdit }: { editing: boolean; cancelEdit: () => void }) {
  useMobileBackStack({
    editing,
    drawerOpen: false,
    settingsSection: null,
    actions: { cancelEdit, closeDrawer: () => {}, closeSettingsSub: () => {} },
  })
  return null
}

export default function AppShell({ tablet = false }: AppShellProps) {
  const words = useWordStore(s => s.words)
  const activeView = useViewStore(s => s.activeView)
  const dictWord = useViewStore(s => s.dictWord)
  const [collapsed, setCollapsed] = useState(false)
  const mode = useSettingsStore(s => s.sidebarMode)
  const activeModule = useViewStore(s => s.activeModule)
  const { assignWordId, editorTarget, closeModals, openEditor } = useUiStore()
  // 平板布局（v0.7.8）：非平板恒为 `{ zoom: 1, sidebarWidth: 300 }`，桌面行为不变。
  const { sidebarWidth: tabletSidebarWidth } = useTabletLayout()
  // 触摸语义（v0.7.8 Task 4 / v0.8.0 Task 7）：布局分支只看 `chrome`，触摸分支只看 `touch`——
  // 两者刻意分开。触摸语义覆盖两种平板档（Android / iOS）：手机走 `MobileShell`（那里的触摸
  // 由 `chrome='mobile'` / `'drawer'` 推出），桌面恒为 false（长按 / 拖拽 / 行尾簇逐字不变）。
  // `androidTablet` 只留给返回栈（v0.7.10 Task 4）与编辑态上报——iPad 没有硬件返回键，
  // 本轮不挂返回栈，故这个判据**刻意比 `touch` 窄**。
  const platform = usePlatformClass()
  const androidTablet = isAndroidTablet(platform)
  const touch = hasTouchSemantics(platform)

  // 词条页的编辑态（v0.7.10 Task 4）：平板要把它压进返回栈（返回键先退编辑）。
  // 编辑态只存在于 `WordWorkbench` 体内，由它经 `onEditStateChange` 上报；保存 / 取消也经
  // 它的 `ref` 调用——外壳只持有「谁在编辑」，不复制编辑逻辑（与 `MobileShell` 同一套做法）。
  const [editing, setEditing] = useState(false)
  const workbenchRef = useRef<WordWorkbenchHandle>(null)
  const cancelEdit = useCallback(() => { workbenchRef.current?.cancelEdit() }, [])
  // 恒定引用：`WordWorkbench` 的卸载 effect 以它为依赖（cleanup 会报 null），
  // 内联箭头会让每次父级重渲都误报一次「退出编辑」，返回栈因此丢掉编辑层。
  const onEditStateChange = useCallback((s: { dirty: boolean } | null) => setEditing(!!s), [])

  // D1：收起宽度 = clamp(最长单词渲染宽度 + 实际 chrome, COLLAPSED_MIN_WIDTH(132px), 240px)，加词/删词重算，过渡走统一动效档
  const sidebarWidth = useMemo(() => {
    if (!collapsed) return tablet ? tabletSidebarWidth : SIDEBAR_EXPANDED_WIDTH
    const chrome = mode === 'alphabet' ? COLLAPSED_CHROME_ALPHABET : COLLAPSED_CHROME_CATEGORY
    const max = measureMaxWordWidth(words.map(w => w.lemma), resolveSidebarWordFont())  // 与渲染同一字体
    return fitCollapsedWidth(max, chrome)
  }, [collapsed, words, mode, tablet, tabletSidebarWidth])

  // 首次关窗弹窗（v0.7.0 §4.7）
  useCloseRequest()
  // 托盘「退出」/ Cmd+Q 的未保存确认（v0.7.8 Task 8）：先过编辑守卫，确认后才真正退出。
  useQuitRequest()

  // 模块 ↔ 数据集的耦合（v0.7.5 Task 10）：工作台取工作区词表，储藏库取储藏库词表。
  // 刻意放在这里而不是 viewStore 的 action——让 viewStore import wordStore 会造成两个
  // store 循环依赖；AppShell 本来就是模块分发的唯一地方。
  // location 已经对了就跳过：链接跳转（linkJump）先 showModule、再自己 await setLocation，
  // 本 effect 后跑到时再设一次会二次加载词表、清掉刚选中的词。
  useEffect(() => {
    if (activeModule !== 'workbench' && activeModule !== 'archive') return
    const target = activeModule === 'archive' ? 'archive' : 'workspace'
    if (useWordStore.getState().location !== target) void useWordStore.getState().setLocation(target)
  }, [activeModule])

  // 统一页内查找：注册全局 Ctrl+F（spec §4b，FindBar 单实例）
  useEffect(() => registerFindKeyHandler(), [])

  // 安全区（v0.8.0 Task 9）：顶 / 底两处 inset 都在这里出——顶栏的 `paddingTop` 让刘海不压
  // 顶栏控件，根节点的 `paddingBottom` 让手势条不压内容。桌面与 Android 上 env() 为 0，
  // 渲染结果逐字不变（只多两个值为 0 的 style 属性）。
  //
  // **缩放二次放大（spec §7.3）**：这两个 inset 都在 `IndexPage` 的 `zoom` 宿主**内部**，
  // `zoom` 会把它们一起缩小（zoom < 1 时 inset 变小）。首次 iPad 真机验证时若发现 inset 不够
  // ——手势条压内容、或顶栏仍贴刘海——备选是把这两条 padding 上移到缩放宿主**外侧**（未缩放层，
  // 即 `IndexPage` 那个包 `<AppShell tablet />` 的 div），并把宿主高度改为
  // `calc((100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom)) / ${zoom})`：
  // 外层已让开安全区、内层不再重复让，inset 也就不经过 zoom。本轮 iPad 无真机，先记在这里。
  return (
    <div
      className={tablet ? 'flex flex-col' : 'h-screen flex flex-col'}
      style={{
        background: 'var(--color-canvas)',
        ...(tablet ? { height: '100%' } : {}),
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* 平板返回栈（v0.7.10 Task 4）：只在 `android-tablet` 挂载，手机在 `MobileShell` 里挂。
          桌面因此不受任何影响（不订阅返回键、不读编辑态）。 */}
      {androidTablet && <TabletBackStack editing={editing} cancelEdit={cancelEdit} />}

      {/* 划词热键启动失败提示条（v0.7.9 Task 16）：只在桌面出现——`take_startup_error`
          是桌面命令，平板（Android）构建里根本没有它。一次性读取，可关闭。 */}
      {platform === 'desktop' && <CollectBanner />}

      {/* 全局顶栏：始终可见，不随侧边栏折叠（规格 §2）。
          顶部安全区（v0.8.0 Task 9）：刘海 / 挖孔下的 iPad 顶栏控件不被压住。`header` 没有
          固定高度，paddingTop 只是把内容整体下移 inset；桌面为 0，逐字不变。 */}
      <header className="shrink-0" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <TopBar />
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* 活动栏：模块切换（工作台 / 储藏库 / 复习 / 设置），设置按钮落在左下角 */}
        <ActivityRail />

        {/* 工作台与储藏库（词表侧栏 + 编辑/词典区）：两个模块共用同一份 DOM，只是数据集不同
            （由上面的 effect 换 location）。模块来回切换时保持挂载、非这两个模块激活时
            display:none 隐藏，以保留词表滚动位置与编辑器组件状态（规格 §5；§8 手动验收 3）。
            复习模块是全屏专注态，同样走隐藏路径，工作台因此不会与复习模块并排显示（spec §2.1）。 */}
        <div
          className="flex flex-1 overflow-hidden"
          style={{ display: activeModule === 'workbench' || activeModule === 'archive' ? 'flex' : 'none' }}
        >
          {/* 侧边栏：展开 300px / 收起内容自适应（D1）+ 底部 footer（规格 §2、§4.5） */}
          <aside
            className="flex flex-col shrink-0"
            style={{
              width: sidebarWidth,
              // 索引栏取 --color-surface-sunken（spec §1.1「索引栏」档，tokens.css:4 的用途注释同此）。
              background: 'var(--color-surface-sunken)',
              borderRight: '1px solid var(--color-border)',
              transition: 'width var(--duration-fast) var(--ease-smooth)',
              overflow: 'hidden',
            }}
          >
            <WordList
              collapsed={collapsed}
              onToggleCollapse={() => setCollapsed(c => !c)}
              mode={mode}
              onToggleMode={() => useSettingsStore.getState().setSidebarMode(mode === 'alphabet' ? 'category' : 'alphabet')}
              touch={touch}
            />
            <SidebarFooter collapsed={collapsed} />
          </aside>

          {/* 右侧区域：词编辑视图 ↔ 词典详情视图（规格 §2，同一时刻仅其一；D2 替换显示）。
              data-find-root 供 FindBar 定位当前模块的搜索根（设置页用同名属性区分）。
              储藏库与工作台共用这一层，标记须跟 activeModule 走：否则储藏库下 FindBar
              查不到标记会回落到 document.body，把隐藏节点也搜进来。 */}
          <main data-find-root={activeModule === 'archive' ? 'archive' : 'workbench'} className="flex-1 overflow-hidden">
            {activeView === 'dict' && dictWord
              ? <DictDetailPanel word={dictWord} />
              : (
                <WordWorkbench
                  ref={workbenchRef}
                  touch={touch}
                  // 编辑态上报只给 Android 平板（手机由 `MobileShell` 接、iPad 没有返回键不挂返回栈）：
                  // 桌面传了只会让它每次进出编辑都白重渲一次外壳，而没有返回栈的平台也没有这份状态要收。
                  onEditStateChange={androidTablet ? onEditStateChange : undefined}
                />
              )}
          </main>
        </div>

        {/* 复习模块（v0.6）：全屏专注态，不做 display:none 保活——切走即卸载，队列留在会话 store */}
        {activeModule === 'review' && <ReviewModule />}

        {activeModule === 'settings' && <SettingsPage />}
      </div>

      <CategoryAssignModal
        open={!!assignWordId}
        wordId={assignWordId ?? ''}
        onClose={closeModals}
        onCreateNew={() => openEditor(null, assignWordId)}
      />
      {editorTarget && (
        <CategoryEditorModal
          open={!!editorTarget}
          category={editorTarget.category}
          wordId={editorTarget.wordId ?? ''}
          onClose={closeModals}
        />
      )}

      <UpdateDialog />
      <ConfirmDialog />
      <FindBar />
    </div>
  )
}
