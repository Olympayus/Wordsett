import type { DictionaryField } from '../types/dictionary'

export interface SynonymMember { word: string; definition: string }
export interface SynonymGroup { description: string; items: SynonymMember[] }

// 组标题提取（v0.5.3 §2.2）：源数据 description 有三种形态，界面需要短标题。
// 规则按序尝试，任一命中即返回；1/2 的结果 trim 后为空则降级到成员词连接。
const DESCRIBED_RE = /这组词都有[「"“](.*?)[」"”]的意思，其区别是：?/
const QUOTED_RE = /[“"「](.*?)[”"」]/

export function extractGroupTitle(group: SynonymGroup): string {
  const memberTitle = group.items.map(i => i.word).join(' & ')
  const desc = group.description.trim()
  if (!desc) return memberTitle

  const quoted = desc.match(DESCRIBED_RE) ?? desc.match(QUOTED_RE)
  // 规则 3：无引号的措辞（如「这三词都与电有关」）携带语义线索，保留原句
  if (!quoted) return desc

  const title = quoted[1].trim()
  return title || memberTitle
}

// resemble.json 组 → 单一「近义词辨析」根容器下挂 组父级（value=组描述作小标题）→ 成员词叶子
// （父子级结构：组边界入库后不丢失，spec：近义词辨析条目用父子级条目承载组）
// 组父级 value = 短标题（v0.5.3 §2.2 经 extractGroupTitle 提取），供界面直接渲染为小标题
export function buildSynonymDiscriminationFields(groups: SynonymGroup[]): DictionaryField[] {
  const groupFields = groups.map(g => ({
    key: 'synonym_discrimination_group',
    value: extractGroupTitle(g),
    children: g.items.map(m => ({
      key: 'synonym_discrimination_item',
      value: m.definition ? `${m.word}: ${m.definition}` : m.word,
    })),
  }))
  return groupFields.length
    ? [{ key: 'synonym_discrimination', value: '', children: groupFields }]
    : []
}
