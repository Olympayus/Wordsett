import type { Word, WordLocation } from '../types/word'
import { normalizeLinkTarget } from './links'

// 搜索下拉与语义网络中「已收录」判定：单词是否已在个人词库（normalizedLemma 精确匹配）
export function isWordCollected(
  word: string,
  collectedWords: Pick<Word, 'normalizedLemma'>[]
): boolean {
  const normalized = word.toLowerCase().trim()
  if (!normalized) return false
  return collectedWords.some(w => w.normalizedLemma === normalized)
}

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
