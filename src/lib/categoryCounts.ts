import type { WordLocation } from '../types/word'

/**
 * 一个分类在两个模块里的词数（v0.7.5 Task 14）。
 *
 * 分类管理与侧栏分组表头共用同一份读数：分类管理说「工作区:3 储藏库:2」，
 * 侧栏表头就是同一句话。两处都不做逐行查询——`wordCategoryMap` 一次取全库，
 * 词的位置由 store 的并集词表（`libraryWords`）给出，一次遍历建完整张表。
 */
export interface LocationCounts {
  workspace: number
  archive: number
}

/** 读数的一段：`stat` 为真的段是数字，组件据此套 `.stat-num`（纯函数不碰样式）。 */
export interface LocationCountSegment {
  text: string
  stat?: boolean
}

/**
 * 「工作区:m 储藏库:n」的分段形态。
 *
 * 数字单独成段而不是让组件从字符串里再解析一遍——`.stat-num` 只包数字，
 * 汉字标签保持二级灰。零也照常显示：0 是事实（这个分类在储藏库里没有词），
 * 藏掉零会让「工作区:3」与「工作区:3 储藏库:2」看起来是两种口径。
 */
export function locationCountSegments(workspace: number, archive: number): LocationCountSegment[] {
  return [
    { text: '工作区:' },
    { text: String(workspace), stat: true },
    { text: ' 储藏库:' },
    { text: String(archive), stat: true },
  ]
}

/** 同一个读数的纯文本形态（测试与需要整句的地方用它，不会与分段版各说各话）。 */
export function locationCountsText(workspace: number, archive: number): string {
  return locationCountSegments(workspace, archive).map(s => s.text).join('')
}

/**
 * 分类 id → 分模块词数。
 *
 * `wordCategoryMap` 是「词 → 它所属的分类 id 列表」（既有形状，不改）；
 * `locationByWord` 是「词 id → 所在模块」，由并集词表（`libraryWords`）构建。
 * 一个词属于多个分类时各分类各记一份，与既有「N 词」的反向计数口径逐字一致。
 *
 * 位置表里查不到的词**不计入任何一侧**：宁可少算，也不把未知位置猜成工作区——
 * 猜错会让储藏库的词悄悄出现在工作区读数里，而少算的词在下一次 `loadWords` 后就归位。
 */
export function categoryLocationCounts(
  wordCategoryMap: Record<string, string[]>,
  locationByWord: ReadonlyMap<string, WordLocation>,
): Map<string, LocationCounts> {
  const counts = new Map<string, LocationCounts>()
  for (const [wordId, categoryIds] of Object.entries(wordCategoryMap)) {
    const location = locationByWord.get(wordId)
    if (!location) continue
    for (const categoryId of categoryIds) {
      const c = counts.get(categoryId) ?? { workspace: 0, archive: 0 }
      c[location] += 1
      counts.set(categoryId, c)
    }
  }
  return counts
}
