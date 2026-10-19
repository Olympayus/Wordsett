import type { Word, WordLocation } from '../types/word'
import { normalizeLinkTarget } from './links'

/**
 * 词库索引的一行（`SELECT normalized_lemma, location FROM words` 的轻量查询结果）。
 * 键的归一化与链接校验 / 反链匹配共用 `normalizeLinkTarget`，不另立规则。
 */
export type LibraryRow = Pick<Word, 'normalizedLemma' | 'location'>

/**
 * 目标词所在模块（v0.7.5 Task 9 的纯函数形态）：入参是全库的行数组，**不读 store**，
 * 于是 Task 4 的 `resolveJumpTarget` 与设置页都能直接测。不在库返回 null。
 *
 * store 的热路径用等价的 Map 形态 `buildLibraryIndex`；两者必须同用一条归一化规则。
 */
export function libraryLocationOf(
  lemma: string,
  rows: readonly LibraryRow[]
): WordLocation | null {
  const key = normalizeLinkTarget(lemma)
  const hit = rows.find(r => normalizeLinkTarget(r.normalizedLemma) === key)
  return hit ? hit.location : null
}

/**
 * `libraryLocationOf` 的 Map 形态：store 的 `libraryIndex` 由它构建，键是
 * `normalizeLinkTarget(lemma)`。同一词面在两个模块里各有一条时后者覆盖前者——
 * `normalized_lemma` 没有唯一索引，这是数据侧既有的不确定性，不在这里掩盖。
 */
export function buildLibraryIndex(rows: readonly LibraryRow[]): Map<string, WordLocation> {
  return new Map(rows.map(r => [normalizeLinkTarget(r.normalizedLemma), r.location]))
}

/**
 * `libraryLocationOf` 的索引形态（v0.7.5 Task 13）：store 的 `libraryIndex` 键已归一化，
 * 故对查询词走同一条 `normalizeLinkTarget`。搜索建议 / 语义网络 / 词典详情页用它取代
 * 按「当前模块词表」判定的旧 `isWordCollected`——那套只看当前模块，储藏库的词会被当成库外。
 */
export function libraryLocationIn(
  index: ReadonlyMap<string, WordLocation>,
  lemma: string
): WordLocation | null {
  return index.get(normalizeLinkTarget(lemma)) ?? null
}

/**
 * 「已收录」标识的文案（v0.7.5 Task 13）：按所在模块分档，不在库返回 null。
 * 三处搜索界面（建议列表 / 语义网络 / 词典详情导航条）共用同一份，不在组件里各写各的。
 */
export function collectedLabel(location: WordLocation | null): string | null {
  if (location === 'workspace') return '已在工作台'
  if (location === 'archive') return '已在储藏库'
  return null
}
