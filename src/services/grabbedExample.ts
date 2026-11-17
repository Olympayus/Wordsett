import { ensureWord } from '../lib/ensureWord'
import { collectorMergeInputs } from '../lib/collectorTree'
import { useWordStore } from '../stores/wordStore'
import { appendExampleUnderDefinition } from './wordService'
import type { PendingAttach } from '../stores/pendingExampleStore'
import type { DictionaryField } from '../types/dictionary'

/**
 * 把划词例句挂到指定释义下（v0.7.9）。
 *
 * 详情页顶部横幅的「添加」与导航条的「添加／添加至…」共用这同一条写入链——两条入口
 * 谁也不能少一步「父级必须存在」：
 * 1. `ensureWord`：词条不存在就先建；
 * 2. `collectorMergeInputs` 只带所选那一枚释义（含祖先词性）走 `mergeWordFields`——
 *    merge 按「父作用域 + 字段 + 值」去重，既有释义幂等，缺的释义补上；
 * 3. `appendExampleUnderDefinition` 按 `(字段, 值)` 找到释义行，把
 *    `example_sentence > example` 挂到它下面（同一例句重复挂是幂等的）。
 */
export async function attachGrabbedExample(
  word: string,
  fields: DictionaryField[],
  attach: PendingAttach,
  sentence: string,
): Promise<boolean> {
  const target = await ensureWord(word)
  if (!target) return false
  const inputs = collectorMergeInputs(fields, new Set([attach.pathKey]))
  if (inputs.length > 0) {
    const merged = await useWordStore.getState().mergeWordFields(target.id, inputs)
    if (!merged) return false
  }
  return appendExampleUnderDefinition(
    target.id,
    { key: attach.fieldKey, value: attach.value },
    sentence,
  )
}
