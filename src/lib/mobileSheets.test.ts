// src/lib/mobileSheets.test.ts
import { describe, it, expect } from 'vitest'
import { rowSheetItems, unitSheetItems, drawerWordSheetItems, removeCategoryItems, categorySheetItems, tabSheetItems, appBarMenuItems, categoryAssignItems, SHEET_CREATE_CATEGORY, addChildSheetItems, pageAddSheetItems, SHEET_ADD_TAB_PREFIX, SHEET_ADD_WORD_ROOT, SHEET_ADD_PHONETIC } from './mobileSheets'

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

describe('categoryAssignItems', () => {
  const cats = [
    { id: 'c1', name: '雅思' },
    { id: 'c2', name: '词根' },
  ]
  it('按顺序列出分类，已属的带 checked、未属的是 false（可点，不 disabled）', () => {
    const items = categoryAssignItems(cats, ['c2'])
    expect(items.map(i => i.label)).toEqual(['雅思', '词根', '+ 新建分类'])
    expect(items[0].checked).toBe(false)
    expect(items[1].checked).toBe(true)
    // 已属行仍**可点**（点一下即移除，spec §3.5），故不能是 disabled
    expect(items.every(i => i.disabled === undefined)).toBe(true)
  })
  it('末行是新建分类哨兵，不是真实分类 id', () => {
    const items = categoryAssignItems(cats, [])
    const last = items.at(-1)!
    expect(last.key).toBe(SHEET_CREATE_CATEGORY)
    expect(last.checked).toBeUndefined()
  })
  it('没有分类时只剩「新建分类」一行', () => {
    expect(categoryAssignItems([], []).map(i => i.label)).toEqual(['+ 新建分类'])
  })
})

describe('appBarMenuItems', () => {
  it('查找排首位，随后是来源色开关、移动与删除', () => {
    expect(appBarMenuItems({ sourceColorsOn: false, moveLabel: '移入储藏库', hasWord: true }).map(i => i.label))
      .toEqual(['查找', '显示来源色', '移入储藏库', '删除词条'])
    expect(appBarMenuItems({ sourceColorsOn: true, moveLabel: '移入储藏库', hasWord: true })[1].label).toBe('隐藏来源色')
  })
  it('查找不依赖选中词：没有选中词时仍有查找与来源色开关', () => {
    expect(appBarMenuItems({ sourceColorsOn: false, moveLabel: '移入储藏库', hasWord: false }).map(i => i.label))
      .toEqual(['查找', '显示来源色'])
    expect(appBarMenuItems({ sourceColorsOn: false, moveLabel: '移入储藏库', hasWord: false })[0])
      .toEqual({ key: 'find', label: '查找' })
  })
})

describe('addChildSheetItems', () => {
  it('逐字取字段名，key 是字段定义 id（与桌面行级 AddMenu 的条目一致）', () => {
    const items = addChildSheetItems([
      { id: 'def-zh', name: '中文释义' },
      { id: 'def-en', name: '英文释义' },
    ])
    expect(items.map(i => i.label)).toEqual(['中文释义', '英文释义'])
    expect(items.map(i => i.key)).toEqual(['def-zh', 'def-en'])
  })
  it('没有可加子项时是空表', () => {
    expect(addChildSheetItems([])).toEqual([])
  })
})

describe('pageAddSheetItems', () => {
  it('可加项 → 缺失标签页 → 添加词根 → 添加音标，文案与桌面 AddMenu 逐字相同', () => {
    const items = pageAddSheetItems({
      fieldDefs: [
        { id: 'def-pos', name: '词性' },
        { id: 'def-sup', name: '补充' },
      ],
      missingTabs: [
        { key: 'phrase', label: '短语' },
        { key: 'exchange', label: '词形变化' },
      ],
    })
    expect(items.map(i => i.label)).toEqual(['词性', '补充', '短语', '词形变化', '添加词根', '添加音标'])
    expect(items.map(i => i.key)).toEqual([
      'def-pos', 'def-sup',
      `${SHEET_ADD_TAB_PREFIX}phrase`, `${SHEET_ADD_TAB_PREFIX}exchange`,
      SHEET_ADD_WORD_ROOT, SHEET_ADD_PHONETIC,
    ])
  })
  it('没有缺失标签页时仍保留词根与音标两条（桌面 extra 恒在）', () => {
    expect(pageAddSheetItems({ fieldDefs: [], missingTabs: [] }).map(i => i.label)).toEqual(['添加词根', '添加音标'])
  })
})
