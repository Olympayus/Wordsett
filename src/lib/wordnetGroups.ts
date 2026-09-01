// WordNet 语义网络分组键 + 空容器工厂。
// 每次调用 freshGroups() 必须返回全新数组；不得用模块级常量的浅拷贝（{ ...emptyGroups }），
// 否则各键与模块级数组共享引用，push 跨词泄漏 → 语义网络随搜索词累加（v0.5.0 回归，见 wordnetGroups.test.ts）。
export const RELATED_GROUP_KEYS = [
  'synonyms', 'hypernyms', 'hyponyms', 'antonyms', 'partWhole',
  'similarTo', 'alsoSee', 'derivatives', 'entailments', 'causes',
  'pertainyms', 'attributes', 'verbGroups',
] as const

export type RelatedGroupKey = (typeof RELATED_GROUP_KEYS)[number]

export interface RelatedGroup {
  words: string[]
  definition?: string
}

export function freshGroups(): Record<string, RelatedGroup[]> {
  return {
    synonyms: [], hypernyms: [], hyponyms: [], antonyms: [], partWhole: [],
    similarTo: [], alsoSee: [], derivatives: [], entailments: [], causes: [],
    pertainyms: [], attributes: [], verbGroups: [],
  }
}