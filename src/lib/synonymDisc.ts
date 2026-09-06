import type { DictionaryField } from '../types/dictionary'

export interface SynonymMember { word: string; definition: string }
export interface SynonymGroup { description: string; items: SynonymMember[] }

// resemble.json 组 → 单一「近义词辨析」根容器下挂 组父级（value=组描述作小标题）→ 成员词叶子
// （父子级结构：组边界入库后不丢失，spec：近义词辨析条目用父子级条目承载组）
export function buildSynonymDiscriminationFields(groups: SynonymGroup[]): DictionaryField[] {
  const groupFields = groups.map(g => ({
    key: 'synonym_discrimination_group',
    value: g.description ?? '',
    children: g.items.map(m => ({
      key: 'synonym_discrimination_item',
      value: m.definition ? `${m.word}: ${m.definition}` : m.word,
    })),
  }))
  return groupFields.length
    ? [{ key: 'synonym_discrimination', value: '', children: groupFields }]
    : []
}
