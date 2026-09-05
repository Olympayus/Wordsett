import type { FieldValue } from '../types/field'

// 各层级字段类型位次（spec §4.1）
const ROOT_RANK: Record<string, number> = {
  phonetic: 0, part_of_speech: 1, supplementary: 2, phrase: 3, exchange: 4, derivatives: 5, word_root: 6, synonym_discrimination: 7,
}
const POS_CHILD_RANK: Record<string, number> = { chinese_definition: 0, english_definition: 1 }
const DEFINITION_CHILD_RANK: Record<string, number> = {
  usage_scenario: 0, example_sentence: 1, synonyms: 2,
}

export const ROOT_FIELD_KEYS = ['phonetic', 'part_of_speech', 'supplementary', 'phrase', 'exchange', 'derivatives', 'word_root', 'synonym_discrimination']

// 字段归属（spec §3.2）：每层允许出现的子字段类型
export const ALLOWED_CHILD_KEYS: Record<string, string[]> = {
  part_of_speech: ['chinese_definition', 'english_definition'],
  chinese_definition: ['usage_scenario', 'example_sentence', 'synonyms'],
  english_definition: ['usage_scenario', 'example_sentence', 'synonyms'],
  supplementary: ['supplementary_item'],
  phrase: ['phrase_item'],
  exchange: ['exchange_item'],
  derivatives: ['derivatives_item'],
  word_root: ['word_root_item'],
  synonym_discrimination: ['synonym_discrimination_item'],
  example_sentence: ['example'],
  synonyms: ['synonym_item'],
}

// 父字段类型（或 null=根级）下，子字段类型的模板位次；容器内项顺序排列
export function templateRank(parentKey: string | null, childKey: string): number {
  if (parentKey === null) return ROOT_RANK[childKey] ?? 99
  if (parentKey === 'part_of_speech') return POS_CHILD_RANK[childKey] ?? 99
  if (parentKey === 'chinese_definition' || parentKey === 'english_definition') return DEFINITION_CHILD_RANK[childKey] ?? 99
  return 0
}

export function compareSiblings(
  keyOf: (fv: FieldValue) => string,
  parentKey: string | null,
  a: FieldValue,
  b: FieldValue
): number {
  const ra = templateRank(parentKey, keyOf(a))
  const rb = templateRank(parentKey, keyOf(b))
  if (ra !== rb) return ra - rb
  return (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
}

// 递归整树按模板排序（不修改原对象）
export function sortTreeByTemplate(keyOf: (fv: FieldValue) => string, roots: FieldValue[]): FieldValue[] {
  const sortLevel = (list: FieldValue[], parentKey: string | null): FieldValue[] =>
    [...list].sort((a, b) => compareSiblings(keyOf, parentKey, a, b)).map(fv =>
      fv.children?.length ? { ...fv, children: sortLevel(fv.children, keyOf(fv)) } : fv
    )
  return sortLevel(roots, null)
}
