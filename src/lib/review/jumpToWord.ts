import { useViewStore } from '../../stores/viewStore'
import { useWordStore } from '../../stores/wordStore'

/**
 * 跳工作台定位到某个词。小结态与薄弱词专项页共用（spec §3.4）。
 *
 * 前两个调用方在会话进行时不可达：小结态下守卫完全惰性（`isSessionLive` 要求 phase 非
 * summary），薄弱词专项页只在概览态渲染。「完整词条」快照的单词标题是第三个调用方，落在
 * 做题区内、答题中即可达，而守卫按设计放行区内每一次点击（`decisionFor` 的 `inArena`
 * 优先返回 allow），故这条路径离开模块时没有确认。spec §5.2 的 arena 豁免与 spec §4.6 的
 * 可点标题相抵，是待定的产品问题，尚未裁决。
 */
export async function jumpToWord(wordId: string): Promise<void> {
  useViewStore.getState().showWorkbench()
  // v0.7.5 Task 10：储藏库模块下复习也 reachable，而工作台恒取工作区词表。
  // 先换数据集再选中（AppShell 的 effect 后跑到时会看到 location 已对而跳过，
  // 不会把刚选中的词清掉）；本来就在工作区时不动，保持原行为。
  if (useWordStore.getState().location !== 'workspace') {
    await useWordStore.getState().setLocation('workspace')
  }
  await useWordStore.getState().selectWord(wordId)
}
