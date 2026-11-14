// src/lib/mobileSheets.test.ts
import { describe, it, expect } from 'vitest'
import { rowSheetItems, unitSheetItems, drawerWordSheetItems, removeCategoryItems, categorySheetItems, tabSheetItems, appBarMenuItems } from './mobileSheets'

describe('rowSheetItems', () => {
  it('叶子行：编辑 / 添加子项 / 删除（判据同桌面 menuItems）', () => {
    expect(rowSheetItems({ isContainer: false, isPosPane: false, isGroupPane: false, rowHasAllowedChildren: true }).map(i => i.label))
      .toEqual(['编辑', '添加子项', '删除'])
  })
  it('容器行：没有「编辑」；删除排最后且是危险色', () => {
    const items = rowSheetItems({ isContainer: true, isPosPane: false, isGroupPane: false, rowHasAllowedChildren: false })
    expect(items.map(i => i.label)).toEqual(['添加子项', '删除'])
    expect(items.at(-1)!.danger).toBe(true)
  })
  it('词性窗格与辨析组标题可以编辑', () => {
    expect(rowSheetItems({ isContainer: false, isPosPane: true, isGroupPane: false, rowHasAllowedChildren: false }).map(i => i.label))
      .toEqual(['编辑', '删除'])
  })
})

describe('unitSheetItems / tabSheetItems / categorySheetItems', () => {
  it('单位只有编辑与删除', () => {
    expect(unitSheetItems().map(i => i.label)).toEqual(['编辑', '删除'])
  })
  it('页签只有删除此标签页', () => {
    expect(tabSheetItems().map(i => i.label)).toEqual(['删除此标签页'])
  })
  it('分类表头是编辑分类 / 删除分类', () => {
    expect(categorySheetItems().map(i => i.label)).toEqual(['编辑分类', '删除分类'])
  })
})

describe('drawerWordSheetItems', () => {
  it('主表四项，无「编辑」', () => {
    expect(drawerWordSheetItems({ moveLabel: '移入储藏库', categoryCount: 3 }).map(i => i.label))
      .toEqual(['添加到…', '从…中移除', '移入储藏库', '删除单词'])
  })
  it('无分类时「从…中移除」置灰不移除（与桌面 disabled 语义一致）', () => {
    const item = drawerWordSheetItems({ moveLabel: '移入储藏库', categoryCount: 0 }).find(i => i.label === '从…中移除')!
    expect(item.disabled).toBe(true)
    expect(item.submenu).toBe(true)
  })
  it('储藏库里的词用「移回工作区」', () => {
    expect(drawerWordSheetItems({ moveLabel: '移回工作区', categoryCount: 1 })[2].label).toBe('移回工作区')
  })
})

describe('removeCategoryItems', () => {
  it('按顺序列出分类名', () => {
    expect(removeCategoryItems(['雅思', '词根']).map(i => i.label)).toEqual(['雅思', '词根'])
  })
})

describe('appBarMenuItems', () => {
  it('首项是来源色开关，随后是移动与删除', () => {
    expect(appBarMenuItems({ sourceColorsOn: false, moveLabel: '移入储藏库', hasWord: true }).map(i => i.label))
      .toEqual(['显示来源色', '移入储藏库', '删除词条'])
    expect(appBarMenuItems({ sourceColorsOn: true, moveLabel: '移入储藏库', hasWord: true })[0].label).toBe('隐藏来源色')
  })
  it('没有选中词时只出来源色开关', () => {
    expect(appBarMenuItems({ sourceColorsOn: false, moveLabel: '移入储藏库', hasWord: false }).map(i => i.label))
      .toEqual(['显示来源色'])
  })
})
