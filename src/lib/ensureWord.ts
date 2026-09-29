import { useWordStore } from '../stores/wordStore'
import type { Word } from '../types/word'

/**
 * 词是否已在库（忽略大小写）——**唯一**一份判据。
 *
 * 收录路径上有三处都要问这句：ensureWord 自身、词典详情面板的展示态与写入守卫、
 * 卡片级「＋ 添加此词典」的写入守卫。三处若各写一份，判据迟早会漂——收进这个纯函数
 * 就是为了让它们不可能不同。
 */
export function isWordInLibrary(lemma: string): boolean {
  return useWordStore.getState().words.some(w => w.lemma.toLowerCase() === lemma.toLowerCase())
}

// 确保词条存在：先查存量（忽略大小写），无则创建
export async function ensureWord(lemma: string): Promise<Word | null> {
  const existing = useWordStore.getState().words.find(w => w.lemma.toLowerCase() === lemma.toLowerCase())
  if (existing) return existing
  return useWordStore.getState().addWord(lemma)
}
