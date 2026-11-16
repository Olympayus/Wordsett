import type { DictionaryField } from '../types/dictionary'
import type { MergeFieldInput } from '../services/wordService'
import { buildMergeInputs } from './dictPlan'

// 小窗释义树（v0.7.9 Task 10）：只呈现词性 + 其直属中/英释义。
//
// key 方案与 `flattenTree` 的路径键**逐字相同**（组 `"${i}"`、叶子 `"${i}-${j}"`），
// 因为 `collectorMergeInputs` 要把同一套键交给 `buildMergeInputs`，而它内部的
// tempId 正是 `${source}:${路径键}`。两处各算一遍序号的话，勾选键与合并输入
// 会悄悄错位——所以定义组与过滤树共用 `definitionsOnly` 这一个出口。

export interface DefinitionLeaf {
  key: string
  label: '中文释义' | '英文释义'
  value: string
  number: number | null
  field: DictionaryField
}

export interface DefinitionGroup {
  key: string
  pos: string
  leaves: DefinitionLeaf[]
}

export interface SentenceAttach {
  text: string
  leafKey: string
}

const ZH_KEY = 'chinese_definition'
const EN_KEY = 'english_definition'

// 只含词性容器与直属中/英释义的过滤树：组内中文在前、英文在后（各自保持原相对顺序）。
// 释义自身的子级（近义词等）一律剥掉——小窗不收录它们，留着还会让 flattenTree
// 多出与模型不一致的路径键。
function definitionsOnly(fields: DictionaryField[]): DictionaryField[] {
  return fields
    .filter(f => f.key === 'part_of_speech')
    .map(f => {
      const kids = f.children ?? []
      const leaves = [
        ...kids.filter(k => k.key === ZH_KEY),
        ...kids.filter(k => k.key === EN_KEY),
      ].map(k => ({ key: k.key, value: k.value, ...(k.source ? { source: k.source } : {}) }))
      return {
        key: f.key,
        value: f.value,
        ...(f.source ? { source: f.source } : {}),
        children: leaves,
      }
    })
}

export function definitionGroups(fields: DictionaryField[]): DefinitionGroup[] {
  return definitionsOnly(fields).map((pos, i) => ({
    key: String(i),
    pos: pos.value,
    // 义号在组内按「中文在前、英文在后」的顺序连续计数（与返回页的单一序号口径一致，
    // 但每组各自从头开始——组是小窗里的独立勾选单元）。
    leaves: (pos.children ?? []).map((leaf, j) => ({
      key: `${i}-${j}`,
      label: leaf.key === ZH_KEY ? '中文释义' : '英文释义',
      value: leaf.value,
      number: j + 1,
      field: leaf,
    })),
  }))
}

export function leafKeys(groups: DefinitionGroup[]): string[] {
  return groups.flatMap(g => g.leaves.map(l => l.key))
}

/**
 * 新词收录的合并输入（仅限新词：释义与例句在同一次 `mergeWordFields` 里插入，
 * tempId 才能解析）。已在库词的句子收录走 Task 14 的 `appendExampleUnderDefinition`，
 * 绝不复用本函数——把既有释义当 root 输入会插出重复释义。
 *
 * `attach` 的叶子会被并入本次选中集（例句必须与它的父释义同批插入），随后追加
 * `example_sentence` 容器与 `example` 两条 user 输入，父级指向该释义的 tempId。
 */
export function collectorMergeInputs(
  fields: DictionaryField[],
  selected: Set<string>,
  attach?: SentenceAttach,
): MergeFieldInput[] {
  const tree = definitionsOnly(fields)
  const next = new Set(selected)
  if (attach) next.add(attach.leafKey)
  const inputs = buildMergeInputs(tree, next)

  if (attach) {
    // tempId 由 buildMergeInputs 以 `${source}:${路径键}` 生成；从它的输出里取回，
    // 不在这里重算来源（重算就得复刻回退规则，两处迟早漂移）。
    const def = inputs.find(i => i.tempId?.endsWith(`:${attach.leafKey}`))
    const containerTempId = 'user:example_sentence'
    inputs.push({
      key: 'example_sentence',
      value: '',
      source: 'user',
      tempId: containerTempId,
      ...(def?.tempId ? { parentTempId: def.tempId } : {}),
    })
    inputs.push({
      key: 'example',
      value: attach.text,
      source: 'user',
      parentTempId: containerTempId,
    })
  }

  return inputs
}
