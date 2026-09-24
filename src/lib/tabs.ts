import type { FieldValue } from '../types/field'

export type TabKey = 'main' | 'phrase' | 'exchange' | 'derivatives' | 'discrimination'

export const TAB_GROUPS: Record<TabKey, { roots: string[]; label: string }> = {
  main:           { roots: ['part_of_speech', 'supplementary'], label: '词性' },
  phrase:         { roots: ['phrase'],      label: '短语' },
  exchange:       { roots: ['exchange'],    label: '词形变化' },
  derivatives:    { roots: ['derivatives'], label: '词源相关词' },
  discrimination: { roots: ['synonym_discrimination'], label: '近义词辨析' },
}

export const TAB_ORDER: TabKey[] = ['main', 'phrase', 'exchange', 'derivatives', 'discrimination']

function tabHasContent(tab: TabKey, roots: FieldValue[], keyOf: (fv: FieldValue) => string): boolean {
  return roots.some(fv => TAB_GROUPS[tab].roots.includes(keyOf(fv)))
}

export function visibleTabs(roots: FieldValue[], keyOf: (fv: FieldValue) => string): TabKey[] {
  return TAB_ORDER.filter(t => tabHasContent(t, roots, keyOf))
}

export function defaultTab(roots: FieldValue[], keyOf: (fv: FieldValue) => string): TabKey | null {
  const vis = visibleTabs(roots, keyOf)
  return vis.includes('main') ? 'main' : vis[0] ?? null
}

export function missingTabs(roots: FieldValue[], keyOf: (fv: FieldValue) => string): TabKey[] {
  return TAB_ORDER.filter(t => !tabHasContent(t, roots, keyOf))
}

export function groupRootsByTab(roots: FieldValue[], keyOf: (fv: FieldValue) => string): Partial<Record<TabKey, FieldValue[]>> {
  const groups: Partial<Record<TabKey, FieldValue[]>> = {}
  for (const t of TAB_ORDER) groups[t] = []
  for (const fv of roots) {
    const tab = TAB_ORDER.find(t => TAB_GROUPS[t].roots.includes(keyOf(fv)))
    if (tab) groups[tab]!.push(fv)
  }
  return groups
}

// 单独标签页的直接内容项 key（主标签页的"内容"就是根容器本身）；
// 近义词辨析根的直属内容是「组」（组下挂辨析项，组小标题=描述），故 tab 底部可直接添加组
export const TAB_ITEM_KEYS: Record<'phrase' | 'exchange' | 'derivatives' | 'discrimination', string> = {
  phrase:         'phrase_item',
  exchange:       'exchange_item',
  derivatives:    'derivatives_item',
  discrimination: 'synonym_discrimination_group',
}

// 标签页「添加」直接添加的目标字段 key：主标签页=根容器（词性/补充）；单独标签页=项
export function addableLeafKeys(tab: TabKey): string[] {
  return tab === 'main' ? TAB_GROUPS.main.roots : [TAB_ITEM_KEYS[tab]]
}

// 单独标签页的平铺子项有两种形态（v0.5.3 §2.3 / N1 修复）：
//   · 叶子项（短语 / 词形变化 / 词源相关词）—— 无卡片样式，渲染进共享容器卡片；
//   · 「组」容器（近义词辨析）—— 组自带 paneStyle 卡片盒与状态色左竖条，本就是完整卡片，
//     再套外层容器只会得到「卡片里套卡片」，故组直接作最高级卡片渲染。
// 判据取自 TAB_ITEM_KEYS：那张表正是「各单独标签页直接内容项的 key」的唯一真相，
// 新增组型标签页时只改表即可，无需在此再列一遍 tab 名。
export function isGroupedTab(tab: TabKey): boolean {
  return tab !== 'main' && TAB_ITEM_KEYS[tab] === 'synonym_discrimination_group'
}
