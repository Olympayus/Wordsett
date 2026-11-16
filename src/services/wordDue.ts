import type { DbHandle } from '../db/init'
import { getWordDueRows } from '../db/review'
import { dueStatusFrom, type WordDueStatus } from '../lib/dueLine'
import { normalizeLinkTarget } from '../lib/links'
import type { WordLocation } from '../types/word'

export type { WordDueStatus }

/**
 * 「已在库」态复习调度行（v0.7.9 Task 11）。
 *
 * 取数在 review 层（`getWordDueRows`），映射在纯函数 `dueStatusFrom`——本函数只做
 * 词面归一化与两层之间的接线，不再复制任何 SQL 或状态判据。
 * 查询失败时按「尚无复习计划」兜底：调度行是装饰性信息，不能挡住已收录态的其余内容。
 */
export async function getWordDueStatus(
  lemma: string,
  location: WordLocation | null,
  h?: DbHandle,
): Promise<WordDueStatus> {
  const result = await getWordDueRows(normalizeLinkTarget(lemma), h)
  return dueStatusFrom(result.ok ? result.data : [], Date.now(), location)
}
