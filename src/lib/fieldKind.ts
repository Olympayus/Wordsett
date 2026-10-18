/**
 * 「这个字段长什么样」的唯一出处（v0.7.3 尾段 §1.4、§10）。
 *
 * 先前这个判断写了三遍，而且三遍互不相干：工作区一句 `def.key === 'example'`（`isExample`）、
 * 返回页 `renderContent` 里一个 `case 'example'`，而决定「一行多条还是逐行」的路由
 * `isLeafFlow` 谁都没问、自己按形状猜。短例句因此被路由判成列举字段，排成了近义词那种 `·` 并列
 * ——这就是「例句形式与近义词形式混用」的全部机制。收成一处之后，路由与渲染不可能再各说各话。
 *
 * 子级的形式由**所在容器**决定，不由它自己的 key 决定：同一个 `*_item` 挂在近义词下是列举项，
 * 挂在辨析组下就是一行一条。表外（含用户自建字段）落 'plain'，即既有的一行一条。
 */
export type FieldKind = 'example' | 'list' | 'plain'

const CONTAINER_KIND: Record<string, FieldKind> = {
  example_sentence: 'example',
  synonyms: 'list', derivatives: 'list', exchange: 'list',
  supplementary: 'list', phrase: 'list', word_root: 'list',
}

export const childKind = (containerKey: string): FieldKind => CONTAINER_KIND[containerKey] ?? 'plain'

export type LeafForm = 'example' | 'english-def' | 'plain'

export const leafForm = (key: string): LeafForm =>
  key === 'example' ? 'example' : key === 'english_definition' ? 'english-def' : 'plain'

// 项类型字段（#4）：标签列不渲染字段名，值占满整行。
export const ITEM_FIELD_KEYS: readonly string[] = ['exchange_item', 'supplementary_item', 'phrase_item', 'derivatives_item', 'synonym_item', 'example', 'word_root_item', 'synonym_discrimination_item']

/** 一行该显示什么标题（v0.7.3 尾段 §10）。
 *  返回页早就有这个判断（`DictDetailCard` 的 `rowLabel`），工作区漏了——平铺标签页那条分支
 *  压根没传 `labelOverride`，于是辨析组回落到字段名，印出「近义词辨析组」。收成一处，两页共用。 */
export function rowTitle(key: string, value: string, name: string): string {
  if (key === 'synonym_discrimination_group') return value
  if (ITEM_FIELD_KEYS.includes(key)) return ''
  return name
}
