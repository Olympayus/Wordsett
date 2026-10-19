/**
 * 词条所在的库模块（v0.7.5）：工作区 / 储藏库。
 *
 * Task 3 先由 store 的 `libraryIndex` 产出（本任务只覆盖工作区，值恒为 `'workspace'`）；
 * Task 8 起词条自身带 `location`，Task 9 把索引扩成两个模块。
 */
export type WordLocation = 'workspace' | 'archive'

export interface Word {
  id: string
  lemma: string
  normalizedLemma: string
  language: string
  /** 词条所在库模块（v0.7.5，schema v7 起落库）：工作区 / 储藏库。 */
  location: WordLocation
  createdAt: number
  updatedAt: number
}

export interface CreateWordInput {
  lemma: string
  language?: string
}

export interface WordWithPreview extends Word {
  partOfSpeechTags?: string[]
  phonetic?: string
}
