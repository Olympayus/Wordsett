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
