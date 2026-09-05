import type { DictionaryField } from '../types/dictionary'

export interface SynonymMember { word: string; definition: string }
export interface SynonymGroup { description: string; items: SynonymMember[] }

// resemble.json 组 → DictionaryField 容器（value=组描述，项=word: 辨析释义，spec §7.3）
export function buildSynonymDiscriminationFields(groups: SynonymGroup[]): DictionaryField[] {
  return groups.map(g => ({
    key: 'synonym_discrimination',
    value: g.description ?? '',
    children: g.items.map(m => ({
      key: 'synonym_discrimination_item',
      value: m.definition ? `${m.word}: ${m.definition}` : m.word,
    })),
  }))
}