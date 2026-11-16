// src/services/lemmaFreq.ts
import { getCachedDb } from '../providers/dbCache'
import { resolveDictPath, toSqliteUrl } from '../providers/dictPath'

export interface FrequencyRow {
  word: string
  frequency: number | null
}

// 惰性解析词库路径：模块导入可能早于首启词典落盘（同 providers/ecdict.ts 的 v0.7.8 修复），
// 故只在查询时调用；resolveDictPath 自带缓存，重复调用不会重复 invoke。
const DICT_NAME = 'ecdict.db'

/**
 * 行 → 词频 Map：键小写；`frequency = NULL` 表示「有这个词、但词频未知」，
 * 按已知最罕见（0）处理（Task 8 的排序口径：0 = 最罕见，undefined = 未知排最后）。
 */
export function parseFrequencyRows(rows: FrequencyRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of rows) {
    map.set(row.word.toLowerCase(), row.frequency ?? 0)
  }
  return map
}

/**
 * 批量查询 ecdict 词频（句子模式的候选排序用，v0.7.9 §6.2）。
 *
 * 契约（Task 8 的 `contentCandidates` 依赖）：**没有 `lemmas` 行的词不出现在 Map 里**，
 * 调用方 `freqs.get(w)` 得 `undefined`，候选按未知排到最后；有行且 `frequency = NULL` 的词映射为 0
 * （已知最罕见、排最前）。输入先小写去重再进 SQL；查询失败返回空 Map，绝不抛出——
 * 词频只是排序优化，不能阻断划词小窗。
 */
export async function getWordFreqs(words: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(words.map(w => w.toLowerCase()))]
  if (unique.length === 0) return new Map()

  try {
    const db = await getCachedDb(toSqliteUrl(await resolveDictPath(DICT_NAME)))
    const placeholders = unique.map((_, i) => `?${i + 1}`).join(', ')
    const rows = await db.select<FrequencyRow[]>(
      `SELECT word, frequency FROM lemmas WHERE word IN (${placeholders})`,
      unique
    )
    return parseFrequencyRows(rows)
  } catch (err) {
    // 静默降级：候选排序回退到「未知词频」，小窗照常打开
    console.error('ecdict 词频查询失败，候选按未知词频排序', err)
    return new Map()
  }
}
