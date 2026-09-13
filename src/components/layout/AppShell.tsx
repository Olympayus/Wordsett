import { useEffect, useState, useMemo } from 'react'
import TopBar from './TopBar'
import WordList from './WordList'
import SidebarFooter from './SidebarFooter'
import WordWorkbench from '../word/WordWorkbench'
import DictDetailPanel from '../search/DictDetailPanel'
import { useWordStore } from '../../stores/wordStore'
import { useViewStore } from '../../stores/viewStore'
import SettingsPage from '../settings/SettingsPage'
import ActivityRail from './ActivityRail'
import { useSettingsStore } from '../../stores/settingsStore'
import { useUiStore } from '../../stores/uiStore'
import CategoryAssignModal from '../word/CategoryAssignModal'
import CategoryEditorModal from '../word/CategoryEditorModal'
import UpdateDialog from '../ui/UpdateDialog'
import ConfirmDialog from '../ui/ConfirmDialog'
import FindBar, { registerFindKeyHandler } from '../ui/FindBar'
import { fitCollapsedWidth, measureMaxWordWidth, resolveSidebarWordFont, COLLAPSED_CHROME_ALPHABET, COLLAPSED_CHROME_CATEGORY, SIDEBAR_EXPANDED_WIDTH } from '../../lib/sidebar'

export default function AppShell() {
  const words = useWordStore(s => s.words)
  const activeView = useViewStore(s => s.activeView)
  const dictWord = useViewStore(s => s.dictWord)
  const [collapsed, setCollapsed] = useState(false)
  const mode = useSettingsStore(s => s.sidebarMode)
  const activeModule = useViewStore(s => s.activeModule)
  const { assignWordId, editorTarget, closeModals, openEditor } = useUiStore()

  // D1：收起宽度 = clamp(最长单词渲染宽度 + 实际 chrome, 120px, 240px)，加词/删词重算，150ms 过渡
  const sidebarWidth = useMemo(() => {
    if (!collapsed) return SIDEBAR_EXPANDED_WIDTH
    const chrome = mode === 'alphabet' ? COLLAPSED_CHROME_ALPHABET : COLLAPSED_CHROME_CATEGORY
    const max = measureMaxWordWidth(words.map(w => w.lemma), resolveSidebarWordFont())  // 与渲染同一字体
    return fitCollapsedWidth(max, chrome)
  }, [collapsed, words, mode])

  // 统一页内查找：注册全局 Ctrl+F（spec §4b，FindBar 单实例）
  useEffect(() => registerFindKeyHandler(), [])

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--color-canvas)' }}>
      {/* 全局顶栏：始终可见，不随侧边栏折叠（规格 §2） */}
      <header className="shrink-0">
        <TopBar />
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* 活动栏：模块切换（工作台 / 设置），设置按钮落在左下角 */}
        <ActivityRail />

        {/* 工作台（词表侧栏 + 编辑/词典区）：模块来回切换时保持挂载、设置激活时 display:none 隐藏，
            以保留词表滚动位置与编辑器组件状态（规格 §5；§8 手动验收 3） */}
        <div
          className="flex flex-1 overflow-hidden"
          style={{ display: activeModule === 'settings' ? 'none' : 'flex' }}
        >
          {/* 侧边栏：展开 300px / 收起内容自适应（D1）+ 底部 footer（规格 §2、§4.5） */}
          <aside
            className="flex flex-col shrink-0"
            style={{
              width: sidebarWidth,
              background: 'var(--color-canvas)',
              borderRight: '1px solid var(--color-border)',
              transition: 'width 150ms var(--ease-smooth)',
              overflow: 'hidden',
            }}
          >
            <WordList
              collapsed={collapsed}
              onToggleCollapse={() => setCollapsed(c => !c)}
              mode={mode}
              onToggleMode={() => useSettingsStore.getState().setSidebarMode(mode === 'alphabet' ? 'category' : 'alphabet')}
            />
            <SidebarFooter collapsed={collapsed} />
          </aside>

          {/* 右侧区域：词编辑视图 ↔ 词典详情视图（规格 §2，同一时刻仅其一；D2 替换显示） */}
          <main className="flex-1 overflow-hidden">
            {activeView === 'dict' && dictWord
              ? <DictDetailPanel word={dictWord} />
              : <WordWorkbench />}
          </main>
        </div>

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
