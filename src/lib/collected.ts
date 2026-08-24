import type { Word } from '../types/word'

// 搜索下拉与语义网络中「已收录」判定：单词是否已在个人词库（normalizedLemma 精确匹配）
export function isWordCollected(
  word: string,
  collectedWords: Pick<Word, 'normalizedLemma'>[]
): boolean {
  const normalized = word.toLowerCase().trim()
  if (!normalized) return false
  return collectedWords.some(w => w.normalizedLemma === normalized)
}
