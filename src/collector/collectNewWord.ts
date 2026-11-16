import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { ensureWord } from '../lib/ensureWord'
import { libraryLocationIn } from '../lib/collected'
import { useWordStore } from '../stores/wordStore'
import {
  setInitialFamiliarity,
  type InitialFamiliarityChoice,
  type MergeFieldInput,
} from '../services/wordService'
import { isGrabCurrent } from './currentGrab'

/**
 * 新词收录的共用写链（v0.7.9 spec §5.4）。
 *
 * 单词模式与句子模式此前各抄了一份约 30 行的流水线；两处顺序必须逐字一致，抽到这里
 * 是为了不再有第二份可以悄悄漂移的实现：
 *
 *   reloadLibraryIndex → 再确认「不在库」→ ensureWord → mergeWordFields →
 *   setInitialFamiliarity → （仍属当前代抓取时）collector_hide
 *
 * **只用于新词**：已在库词的例句追加走 `wordService.appendExampleUnderDefinition`
 * （直接按既有释义行 id 挂父级），绝不经过本函数。
 *
 * 返回值区分三种结局：`'already'` 是落库前复核发现词已经在库——静默放弃（Root 的
 * 索引订阅会把界面换成已在库态），不是错误；`'failed'` 才由调用方显示红字。
 */
export type CollectNewWordResult = 'collected' | 'already' | 'failed'

export async function collectNewWord(opts: {
  word: string
  inputs: MergeFieldInput[]
  familiarity: InitialFamiliarityChoice
  /**
   * 本次抓取的代际。只有它仍是当前代时才隐藏小窗：写链比一次新抓取慢时，隐藏会把
   * 新窗口一起藏掉。用代际而不是「组件是否还挂载」——写链中途索引刷新会让 Root
   * 换成已在库卡，同一个代际下的组件卸载不该阻止隐藏。
   */
  grabId: number
}): Promise<CollectNewWordResult> {
  const { word, inputs, familiarity, grabId } = opts
  try {
    // 落库前再确认一次「不在库」：Root 的索引刷新与组件的挂载是并行的。`ensureWord`
    // 只会复用既有词条、不会拒绝，随后的 merge 会把同一批释义再插一遍。
    await useWordStore.getState().reloadLibraryIndex()
    if (libraryLocationIn(useWordStore.getState().libraryIndex, word) !== null) return 'already'

    const target = await ensureWord(word)
    if (!target) throw new Error('ensureWord returned null')
    const merged = await useWordStore.getState().mergeWordFields(target.id, inputs)
    if (!merged) throw new Error('mergeWordFields failed')
    // 写入失败不阻断收录（字段已落库，缺失只让该词回落 1），与搜索返回页的取舍一致。
    const wrote = await setInitialFamiliarity(target.id, familiarity)
    if (!wrote) console.error('[collector] 初始熟悉度写入失败')
    // 跨 webview 通知主窗刷新词库（App 层监听后 `loadWords`）：小窗与主窗的 zustand
    // 实例不共享，否则侧栏 / 计数 / 「已在库」判据要等下一次自然重载才更新。
    // 通知失败不影响收录结果——词已经落库。
    void emit('library-changed').catch(e => console.error('[collector] 通知主窗刷新词库失败', e))
    // 隐藏失败不该把一次已经落库的收录报成失败（窗口没藏起来只是体验问题）。
    if (isGrabCurrent(grabId)) {
      await invoke('collector_hide').catch(e => console.error('[collector] 隐藏小窗失败', e))
    }
    return 'collected'
  } catch (e) {
    console.error('[collector] 收录失败', e)
    return 'failed'
  }
}
