import { useViewStore } from '../../stores/viewStore'
import { useWordStore } from '../../stores/wordStore'

/**
 * 跳工作台定位到某个词。小结态与薄弱词专项页共用（spec §3.4）。
 *
 * 只在无会话进行时可达：小结态下守卫完全惰性（`isSessionLive` 要求 phase 非 summary），
 * 薄弱词专项页只在概览态渲染。故这里不存在「丢掉一轮答题」——v0.6.2 §5.2 的守卫不管这条路径。
 */
export async function jumpToWord(wordId: string): Promise<void> {
  useViewStore.getState().showWorkbench()
  await useWordStore.getState().selectWord(wordId)
}
