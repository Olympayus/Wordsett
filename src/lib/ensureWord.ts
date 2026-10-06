import { useWordStore } from '../stores/wordStore'
import type { Word } from '../types/word'
import type { AddWordOptions } from '../services/wordService'

/**
 * 词是否已在库（忽略大小写）——**两处写入守卫**共用的判据出处：词典详情面板的
 * 合并添加、卡片级「＋ 添加此词典」。两处若各写一份，守卫迟早会漂。
 *
 * 另外两处刻意不共用：ensureWord 自己要的是那条 `Word` 而非布尔；面板渲染态的
 * inLibrary 要的是活订阅（用本函数读 getState() 会让词表变化不重渲染）。三处表达式
 * 逐字符相同，差异只在要不要 Word 对象 / 要不要响应式。
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
