import { canGoBack, canGoForward } from './navHistory'
import { useNavHistoryStore } from '../stores/navHistoryStore'
import { useViewStore } from '../stores/viewStore'
import { useWordStore } from '../stores/wordStore'
import type { WordLocation } from '../types'

/**
 * 前进 / 后退的启用判据与回调（Task 5 从 `WorkbenchNavBar.tsx` 抽出的 `locationOfHistoryId`
 * 与 `go`）。桌面导航条与手机顶栏是同一个动作的两处入口，顺序必须逐字一致，故整段搬过来、
 * 一处实现。
 *
 * 历史项 → 词条**当前**所在模块（v0.7.5 修正）。已删除 / 已不在库返回 null，历史项随之丢弃；
 * 移过模块的项拿到新位置，退回它时才不会切错数据集。
 */
function locationOfHistoryId(id: string): WordLocation | null {
  return useWordStore.getState().libraryWords.find(w => w.id === id)?.location ?? null
}

/**
 * 导航切换不入栈（record:false），否则后退会立刻变成前进。
 * 顺序与 `useLinkJump` 一致（硬要求）：先切模块 → 数据集不同则切数据集 → 最后选中词条。
 * 反过来的话 `selectWord` 会在旧数据集里找目标；先选后换数据集则 `setLocation` 会把
 * 刚选中的词清掉——跨模块后退就落进「空态里没有导航条」的死角（v0.7.5 修复的关键）。
 */
async function go(dir: 'back' | 'forward'): Promise<void> {
  const nav = useNavHistoryStore.getState()
  const entry = dir === 'back'
    ? nav.goBack(locationOfHistoryId)
    : nav.goForward(locationOfHistoryId)
  if (!entry) return
  useViewStore.getState().showModule(entry.location === 'archive' ? 'archive' : 'workbench')
  if (useWordStore.getState().location !== entry.location) {
    await useWordStore.getState().setLocation(entry.location)
  }
  await useWordStore.getState().selectWord(entry.id, { record: false })
}

export interface WorkbenchNavigation {
  canBack: boolean
  canForward: boolean
  goBack: () => void
  goForward: () => void
}

export function useWorkbenchNavigation(): WorkbenchNavigation {
  const history = useNavHistoryStore(s => s.history)
  return {
    // 与 `WorkbenchNavBar` 同判据：前进箭头只在 workbench 区渲染，故禁用态恒为 false。
    canBack: canGoBack(history),
    canForward: canGoForward(history),
    goBack: () => { void go('back') },
    goForward: () => { void go('forward') },
  }
}
