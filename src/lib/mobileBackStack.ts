/**
 * 安卓返回栈的纯判据（Task 10）。
 *
 * 「此刻按下返回该做什么」是**唯一**出处：`MobileShell` 只负责把当前的层集合按**栈顶在前的顺序**
 * 交给 `backAction`，自己不写任何 if/else 判断该关哪一层。这样加一层（或调一次优先级）只动这里。
 *
 * 层按优先级从高到低：动作表（sheet，Plan 2）→ 编辑 → 抽屉 → 词典详情 → 搜索
 * → 复习会话 → 设置子页 → 词条导航。
 * 栈底的「词条导航」是**可选层**：它只在真的还有上一个词条时才进栈（否则返回会去关模块，
 * 那是另一件事，见 `MobileShell` 的 `layers`）。
 *
 * `backAction` 只看栈顶**一个**元素——传进来的顺序就是栈的顺序（`layers[0]` 即栈顶），
 * 故不需要也无法从函数内部知道栈有多深。
 */

export type BackLayerKind = 'sheet' | 'edit' | 'drawer' | 'dict' | 'search' | 'review' | 'settings-sub' | 'module'

export type BackAction =
  | { type: 'closeSheet' }
  | { type: 'cancelEdit' }
  | { type: 'closeDrawer' }
  | { type: 'closeDict' }
  | { type: 'closeSearch' }
  /** 复习会话进行中（spec §5.5 第 7 条）：先弹「继续复习 / 离开」，不能直接退出应用。 */
  | { type: 'leaveReview' }
  /** 设置页的「目录 → 子页」：返回键先回目录，而不是直接把整个设置模块退掉。 */
  | { type: 'closeSettingsSub' }
  | { type: 'popModule' }
  | { type: 'exit' }

/** 栈顶的层 → 返回动作。表而非 switch：加一层就是加一行，优先级一眼可读。 */
const ACTION_FOR_LAYER: Record<BackLayerKind, BackAction> = {
  sheet: { type: 'closeSheet' },
  edit: { type: 'cancelEdit' },
  drawer: { type: 'closeDrawer' },
  dict: { type: 'closeDict' },
  search: { type: 'closeSearch' },
  review: { type: 'leaveReview' },
  'settings-sub': { type: 'closeSettingsSub' },
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

/**
 * 「此刻应该有哪些层」——`MobileShell` 组装层集合的判据本身（已抽成纯函数，便于单测）。
 *
 * 这里判的是**投影关系**而不是顺序：哪些模块会出现哪些层、详情层只在能看见它的模块里算
 * （词条页与搜索），复习会话只在真的进行中才算。顺序与动作仍归 `ACTION_FOR_LAYER`；
 * 两者分开时，「层收窄错」与「优先级排错」这两类问题各自能钉住。
 */
export interface BackLayerInput {
  module: 'workbench' | 'archive' | 'search' | 'review' | 'settings'
  view: 'workbench' | 'dict'
  dictWord: string | null
  /** 词条页正在编辑某个字段（`WordWorkbench` 上报）。 */
  editing: boolean
  drawerOpen: boolean
  /** 设置页正在某个分区子页；`null` = 目录。 */
  settingsSection: string | null
  /** 词条导航历史里还有上一个词条。 */
  canBack: boolean
  /** 复习会话进行中（`isSessionLive`）。 */
  reviewLive: boolean
}

/** 按优先级从高到低组装层集合（栈顶在前，交给 `backAction`）。 */
export function backLayers(input: BackLayerInput): BackLayerKind[] {
  const wordPage = input.module === 'workbench' || input.module === 'archive'
  return [
    ...(wordPage && input.editing ? ['edit' as const] : []),
    ...(wordPage && input.drawerOpen ? ['drawer' as const] : []),
    // 详情层只在能看见详情的模块里算：词条页与搜索。别的模块带着 detail 状态进来时
    // （今天不可达）这一层会「关」一个看不见的页面，把下面的层挤到下一次。
    ...((wordPage || input.module === 'search') && input.view === 'dict' && input.dictWord
      ? ['dict' as const] : []),
    ...(input.module === 'search' && input.view !== 'dict' ? ['search' as const] : []),
    ...(input.module === 'review' && input.reviewLive ? ['review' as const] : []),
    ...(input.module === 'settings' && input.settingsSection ? ['settings-sub' as const] : []),
    // 词条导航只在词条视图里算：详情态已在上一步被吃掉，此时它是「关闭详情」，不是「换词」。
    ...(wordPage && input.view === 'workbench' && input.canBack ? ['module' as const] : []),
  ]
}
