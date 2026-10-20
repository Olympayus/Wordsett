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
