/**
 * 安卓返回栈的纯判据（Task 10）。
 *
 * 「此刻按下返回该做什么」是**唯一**出处：`MobileShell` 只负责把当前的层集合按**栈顶在前的顺序**
 * 交给 `backAction`，自己不写任何 if/else 判断该关哪一层。这样加一层（或调一次优先级）只动这里。
 *
 * 层按优先级从高到低：动作表（sheet，Plan 2）→ 编辑 → 抽屉 → 词典详情 → 搜索 → 词条导航。
 * 栈底的「词条导航」是**可选层**：它只在真的还有上一个词条时才进栈（否则返回会去关模块，
 * 那是另一件事，见 `MobileShell` 的 `layers`）。
 *
 * `backAction` 只看栈顶**一个**元素——传进来的顺序就是栈的顺序（`layers[0]` 即栈顶），
 * 故不需要也无法从函数内部知道栈有多深。
 */

export type BackLayerKind = 'sheet' | 'edit' | 'drawer' | 'dict' | 'search' | 'module'

export type BackAction =
  | { type: 'closeSheet' }
  | { type: 'cancelEdit' }
  | { type: 'closeDrawer' }
  | { type: 'closeDict' }
  | { type: 'closeSearch' }
  | { type: 'popModule' }
  | { type: 'exit' }

/** 栈顶的层 → 返回动作。表而非 switch：加一层就是加一行，优先级一眼可读。 */
const ACTION_FOR_LAYER: Record<BackLayerKind, BackAction> = {
  sheet: { type: 'closeSheet' },
  edit: { type: 'cancelEdit' },
  drawer: { type: 'closeDrawer' },
  dict: { type: 'closeDict' },
  search: { type: 'closeSearch' },
  module: { type: 'popModule' },
}

/**
 * 栈顶（`layers[0]`）对应的返回动作；空栈 = 没有可关的层，退出应用。
 *
 * 未知层（理论上不会出现，调用点只传 `BackLayerKind`）不抛异常也不返回 `undefined`——
 * 返回 `undefined` 会让 `MobileShell` 的调用点走进 `default` 分支而静默什么都不做，
 * 用户按返回毫无反应；这里显式退出的代价是「多按一次返回」，方向是安全的。
 */
export function backAction(layers: readonly BackLayerKind[]): BackAction {
  const top = layers[0]
  if (!top) return { type: 'exit' }
  return ACTION_FOR_LAYER[top] ?? { type: 'exit' }
}
