import { useWordStore } from '../stores/wordStore'
import type { Word } from '../types/word'
import type { AddWordOptions } from '../services/wordService'
import { normalizeLinkTarget } from './links'

/**
 * 词是否已在库——判据出处。读 store 的 `libraryIndex`（v0.7.5 Task 9 起含工作区 ∪
 * 储藏库）：储藏库里的词同样算在库，否则词典面板会把一个已收藏的词当成新词再收一遍。
 * 写入守卫（词典详情面板的合并添加 handleMergeAdd）直接调用它；同面板渲染期的活订阅
 * 读法（inLibrary）需要同一判据，两处若各写一份，判据迟早会漂。
 *
 * 另两处刻意不共用：ensureWord 自己要的是那条 `Word` 而非布尔；inLibrary 要的是活订阅
 * （用本函数读 getState() 会让词表变化不重渲染）。差异只在要不要 Word 对象 / 要不要响应式。
 */
export function isWordInLibrary(lemma: string): boolean {
  return useWordStore.getState().libraryIndex.has(normalizeLinkTarget(lemma))
}

// 确保词条存在：先查当前模块已加载的词表（忽略大小写与首尾空白），无则交给 addWord。
//
// 当前模块的词表里没有、不代表库里没有——目标可能在另一个模块。索引含两个模块，
// 但索引只回答「在哪」、给不出 `Word` 本身，故这种情况仍走 addWord：服务层按全库
// `normalized_lemma` 查重，命中既有行就原样返回、**不新建**（硬要求，见 wordService.addWord）。
// opts 只透传「＋ 路径跳过默认分类」这一个开关（见 AddWordOptions）。
export async function ensureWord(lemma: string, opts?: AddWordOptions): Promise<Word | null> {
  const state = useWordStore.getState()
  const key = normalizeLinkTarget(lemma)
  const existing = state.words.find(w => normalizeLinkTarget(w.lemma) === key)
  if (existing) return existing
  return state.addWord(lemma, opts)
}
