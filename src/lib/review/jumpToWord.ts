import { useViewStore } from '../../stores/viewStore'
import { useWordStore } from '../../stores/wordStore'

/**
 * 跳工作台定位到某个词。小结态与薄弱词专项页共用（spec §3.4）。
 *
 * 切模块时会话按 v0.6 spec §2.4 的既有语义暂停保留——不走 reset，切回复习模块即续。
 */
export async function jumpToWord(wordId: string): Promise<void> {
  useViewStore.getState().showWorkbench()
  await useWordStore.getState().selectWord(wordId)
}
