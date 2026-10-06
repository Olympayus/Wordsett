import { useWordStore } from '../stores/wordStore'
import type { Word } from '../types/word'
import type { AddWordOptions } from '../services/wordService'

/**
 * 词是否已在库（忽略大小写）——判据出处。写入守卫（词典详情面板的合并添加
 * handleMergeAdd）直接调用它；同面板渲染期的活订阅读法（inLibrary）需要同一判据，
 * 两处若各写一份，判据迟早会漂。
 *
 * 另两处刻意不共用：ensureWord 自己要的是那条 `Word` 而非布尔；inLibrary 要的是活订阅
 * （用本函数读 getState() 会让词表变化不重渲染）。三处表达式逐字符相同，差异只在
 * 要不要 Word 对象 / 要不要响应式。
 */
export function isWordInLibrary(lemma: string): boolean {
  return useWordStore.getState().words.some(w => w.lemma.toLowerCase() === lemma.toLowerCase())
}

// 确保词条存在：先查存量（忽略大小写），无则创建。
// opts 只透传「＋ 路径跳过默认分类」这一个开关（见 AddWordOptions）。
export async function ensureWord(lemma: string, opts?: AddWordOptions): Promise<Word | null> {
  const existing = useWordStore.getState().words.find(w => w.lemma.toLowerCase() === lemma.toLowerCase())
  if (existing) return existing
  return useWordStore.getState().addWord(lemma, opts)
}
