import type { WordLocation } from '../types/word'
import { collectedLabel, libraryLocationIn } from './collected'

/**
 * 手机搜索页的一行建议（Task 7）。
 *
 * 单列列表，**不分组、不加「词典」标记**（spec §4.5）——手机没有桌面建议下拉的
 * 「单词建议 / 中文释义」分组头，也不标注某个建议来自哪本词典。
 * 三件数据同出一处：词面、中文释义（中文查询路径才有）、已收录标识。
 */
export interface SearchRow {
  lemma: string
  gloss: string
  collected: string | null
}

/**
 * 建议词数组 → 列表行。已收录标识走**词库索引**（工作区 ∪ 储藏库，`libraryLocationIn`）
 * 与 `collectedLabel` 分档，与桌面 `SearchSuggestions` / 词典详情页共用同一份判定，
 * 不在这里另写一套（否则储藏库的词会被当成库外）。
 *
 * `glosses` 缺键时回落空串（英文查询路径本就不带释义）。
 */
export function searchRows(
  suggestions: readonly string[],
  libraryIndex: ReadonlyMap<string, WordLocation>,
  glosses: Record<string, string>
): SearchRow[] {
  return suggestions.map(lemma => ({
    lemma,
    gloss: glosses[lemma] ?? '',
    collected: collectedLabel(libraryLocationIn(libraryIndex, lemma)),
  }))
}

/** 建议行里的一段文字：`hit` 为真表示命中查询词，由调用方包 `<mark>`。 */
export interface TextSegment {
  text: string
  hit: boolean
}

/**
 * 词面 / 释义 → 命中段与普通段（Task 25）。
 *
 * - **大小写不敏感**（`Vocab` 能被 `vocab` 命中），命中段保留原文大小写。
 * - **重叠不重复**：上一段命中结束后才继续找，`aaaa` 查 `aa` 得到 `[aa][aa]` 两段。
 * - **空查询**（含纯空白）返回单段 `{ text, hit: false }`——调用方不必先判空。
 * - 查询先 `trim`，与 `searchLemmas` / `searchChinese` 的取数口径一致，避免输入框尾随空格
 *   命中不了实际返回的建议词。
 */
export function highlightSegments(text: string, query: string): TextSegment[] {
  const needle = query.trim().toLowerCase()
  if (!needle || !text) return [{ text, hit: false }]
  const haystack = text.toLowerCase()
  const segments: TextSegment[] = []
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at === -1) break
    if (at > from) segments.push({ text: text.slice(from, at), hit: false })
    segments.push({ text: text.slice(at, at + needle.length), hit: true })
    from = at + needle.length
  }
  if (from === 0) return [{ text, hit: false }]  // 一段都没命中
  if (from < text.length) segments.push({ text: text.slice(from), hit: false })
  return segments
}
