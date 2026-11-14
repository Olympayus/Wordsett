/**
 * 手机底部动作表的条目模型（v0.7.7 Task 2）。
 *
 * 纯函数、无 React：屏幕上的每一张表都是「一个有顺序的 SheetItem 数组」，组件只负责画。
 * 文案一律与桌面逐字一致——桌面那几处菜单各写一套、改文案时容易漂，手机这张表因此
 * 把判据与文字一起收在这里，调用点只做 `onPick` 映射。
 *
 * 三条判据照抄 `WordWorkbench` 的 `menuItems`（v0.7.4 决定三「行级只删不加」）：
 * - 「编辑」只在 `!isContainer || isPosPane || isGroupPane`；
 * - 「添加子项」只在 `isContainer || rowHasAllowedChildren`；
 * - 「删除」永远最后一条，且 `danger: true`。
 */

export interface SheetItem {
  key: string
  label: string
  danger?: boolean
  /** 有二级表：点了换内容而不是执行动作（「从…中移除」）。 */
  submenu?: boolean
  disabled?: boolean
  /**
   * 可勾选项（v0.7.7 Task 10，spec §3.5）：`undefined` = 不是勾选项（既有所有表逐字不变）；
   * `boolean` = 该行带勾选态，点击即切换、**不关表**。组件据此渲染 `aria-checked` 与右侧勾选方块。
   * 与 `disabled` 互斥地表达不同语义：勾选项永远可点（点一下即增删），置灰项不可点。
   */
  checked?: boolean
}

/** 底部表的取消键文案（Task 3 的 `MobileActionSheet` 消费）。 */
export const SHEET_CANCEL = '取消'
/** 二级表左下角的返回键文案。 */
export const SHEET_BACK = '‹ 返回'

/**
 * 正文行（行内正文 / 词性标签 / 辨析组标题）的表。
 * `rowHasAllowedChildren` 由调用点按 `ALLOWED_CHILD_KEYS[key].length > 0` 给出，
 * 与桌面 `menuItems` 的 `addChild` 判据同一个来源。
 */
export function rowSheetItems(a: {
  isContainer: boolean
  isPosPane: boolean
  isGroupPane: boolean
  rowHasAllowedChildren: boolean
}): SheetItem[] {
  const items: SheetItem[] = []
  if (!a.isContainer || a.isPosPane || a.isGroupPane) {
    items.push({ key: 'edit', label: '编辑' })
  }
  if (a.isContainer || a.rowHasAllowedChildren) {
    items.push({ key: 'addChild', label: '添加子项' })
  }
  items.push({ key: 'delete', label: '删除', danger: true })
  return items
}

/** 流式单位（近义词 / 词源相关词 / 词形变化等短条目）的表：只编辑与删除（D17）。 */
export function unitSheetItems(): SheetItem[] {
  return [
    { key: 'edit', label: '编辑' },
    { key: 'delete', label: '删除', danger: true },
  ]
}

/**
 * 抽屉词表一行的表。与桌面 `wordMenuItems` 的差别只有一条：不设「编辑」——
 * 手机上「编辑」就是点开这个词条本身，不占表里一格。
 * `moveLabel` 由调用方从 `moveActionLabel(location)` 取（移入储藏库 / 移回工作台）。
 */
export function drawerWordSheetItems(a: { moveLabel: string; categoryCount: number }): SheetItem[] {
  return [
    { key: 'assign', label: '添加到…' },
    {
      key: 'remove',
      label: '从…中移除',
      // 与桌面 disabled 语义一致：没有分类时置灰而不是把这一条抽掉（位置不跳）。
      disabled: a.categoryCount === 0,
      submenu: true,
    },
    { key: 'move', label: a.moveLabel },
    { key: 'delete', label: '删除单词', danger: true },
  ]
}

/** 「从…中移除」的二级表：按顺序列出分类名；key 就是分类名，调用点据此回查分类。 */
export function removeCategoryItems(names: string[]): SheetItem[] {
  return names.map(name => ({ key: name, label: name }))
}

/**
 * 分类分配表（v0.7.7 Task 10，spec §3.5「分配弹窗」）。
 *
 * 已属分类逐行带 `checked`、点一下即移除；未属的点一下即加入。切换**不关表**，故这是
 * 一张「表内容跟着 store 重算」的活表——`assignedIds` 由调用点每次渲染现取。
 * 末行「＋ 新建分类」不是分类：key 用哨兵值，调用点据此分流到 `onCreateNew`。
 */
export const SHEET_CREATE_CATEGORY = '__create_category__'

export function categoryAssignItems(
  categories: { id: string; name: string }[],
  assignedIds: Iterable<string>,
): SheetItem[] {
  const assigned = new Set(assignedIds)
  return [
    ...categories.map(cat => ({ key: cat.id, label: cat.name, checked: assigned.has(cat.id) })),
    { key: SHEET_CREATE_CATEGORY, label: '+ 新建分类' },
  ]
}

/** 抽屉分类表头的表。 */
export function categorySheetItems(): SheetItem[] {
  return [
    { key: 'edit', label: '编辑分类' },
    { key: 'delete', label: '删除分类', danger: true },
  ]
}

/** 页签长按的表（桌面 `TabBar` 的右键菜单在手机上收成这一条）。 */
export function tabSheetItems(): SheetItem[] {
  return [{ key: 'delete', label: '删除此标签页', danger: true }]
}

/**
 * 行级「添加子项」的 grid 表（v0.7.7 fix Important 3，spec §3.9 不变量 5 / §3.3 grid）。
 *
 * 条目就是桌面 `AddMenu` 在行级列出的那一批——该容器 `ALLOWED_CHILD_KEYS` 允许的子字段，
 * 文案逐字取字段名。调用点只做 `key → onPickAdd(containerFv, def)` 的映射。
 */
export function addChildSheetItems(defs: { id: string; name: string }[]): SheetItem[] {
  return defs.map(d => ({ key: d.id, label: d.name }))
}

/** 页级添加表里「新建标签页」的 key 前缀；其余 key 是字段定义 id 或下面两个哨兵。 */
export const SHEET_ADD_TAB_PREFIX = '__add_tab__:'
/** 页级添加表的「添加词根」（桌面 `pageAddExtra` 的第二条）。 */
export const SHEET_ADD_WORD_ROOT = '__add_word_root__'
/** 页级添加表的「添加音标」（桌面 `pageAddExtra` 的第三条）。 */
export const SHEET_ADD_PHONETIC = '__add_phonetic__'

/**
 * 页级「＋ 添加」的 grid 表：与桌面 `AddMenu` 的 `pageAddItems` + `pageAddExtra` 同一份选项、
 * 同一批文案——本标签页可加项、缺失标签页、添加词根、添加音标。
 * 桌面把后三类放在「新建标签页」小节里；grid 没有分节，顺序保持不变。
 */
export function pageAddSheetItems(a: {
  fieldDefs: { id: string; name: string }[]
  missingTabs: { key: string; label: string }[]
}): SheetItem[] {
  return [
    ...a.fieldDefs.map(d => ({ key: d.id, label: d.name })),
    ...a.missingTabs.map(t => ({ key: `${SHEET_ADD_TAB_PREFIX}${t.key}`, label: t.label })),
    { key: SHEET_ADD_WORD_ROOT, label: '添加词根' },
    { key: SHEET_ADD_PHONETIC, label: '添加音标' },
  ]
}

/**
 * 顶栏 ⋯ 的表。首项是来源色开关（`sourceColorsOn` 即编者模式），
 * 移动与删除只在选中词时出现；没有选中词时只剩开关（Ruling 3）。
 */
export function appBarMenuItems(a: { sourceColorsOn: boolean; moveLabel: string; hasWord: boolean }): SheetItem[] {
  const items: SheetItem[] = [
    { key: 'sourceColors', label: a.sourceColorsOn ? '隐藏来源色' : '显示来源色' },
  ]
  if (a.hasWord) {
    items.push({ key: 'move', label: a.moveLabel })
    items.push({ key: 'delete', label: '删除词条', danger: true })
  }
  return items
}
