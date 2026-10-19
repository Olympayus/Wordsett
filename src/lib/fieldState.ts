import type { FieldValue } from '../types/field'

// 字段来源四态（v0.7.3：加 'none'）。
// 先前只有三态，靠「非编者模式一律折成 original、而 original 不出条」来实现「普通模式不显示来源」。
// v0.7.3 要求**编者模式下原始值也出条**（默认色那条），于是「有没有条」不能再由 original 兼任，
// 必须显式加一个 'none'：`rowSourceState` 在非编者模式返回它，SourceBar 对它返回 null。
// 从 WordWorkbench 抽出，供字段卡容器与音标 / 词根 chip 共用同一份真相。
export type FieldState = 'none' | 'original' | 'edited' | 'personal'

/** 编辑优先于来源：改过的词典字段算「已编辑」，只有未改动的用户新增才算「个人」 */
export const fieldState = (fv: FieldValue): Exclude<FieldState, 'none'> =>
  fv.edited ? 'edited' : (fv.source === 'user' ? 'personal' : 'original')

/**
 * 四态底色。**音标行是它仅剩的消费点**（PhoneticArea.tsx：编者模式下按来源三态上底）。
 * 字段卡（v0.7.2 起）已不再用底色编码，改由形状承载——SourceBar 的左条
 * （`--color-weave-edited` 在 SourceMark.tsx 仍在用，故 weave token 不删）。
 * `none` 是「不出条」，本表里没有对应的可见底色，故取 `transparent`（它只在有人误用时兜底）。
 */
export const FIELD_STATE_BG: Record<FieldState, string> = {
  none: 'transparent',
  original: 'var(--color-surface-sunken)',
  edited: 'var(--color-brand-softer)',
  personal: 'var(--color-accent-soft)',
}

/** 单位（叶子行）的来源态（v0.7.4 决定九）。
 *  `inUserContainer` = 它挂在用户自己建的容器下——那时整棵子树都是「用户创建」色，
 *  **继承优先于节点自身**（用户原话：用户添加的容器，里面添加的词的小点都是用户添加色）。 */
export const unitState = (fv: FieldValue, inUserContainer: boolean): Exclude<FieldState, 'none'> =>
  inUserContainer ? 'personal' : fieldState(fv)

/** 容器行的来源态（v0.7.4 决定九）：容器自己建的 → personal；词典自带但**本段内**有被改过 /
 *  用户添加的节点 → edited；都干净 → original。
 *
 *  **聚合在嵌套容器处止步**（v0.7.4 修复轮，用户实测反馈）：容器只聚合**自己的行与直属叶子**，
 *  不穿透子容器。每个容器色条覆盖自己的整段（标题行 → 子树结束），内层容器有自己的那一段——
 *  改一个例句时，例句块（标题 + 各例句）整段变 edited，而上方「英文释义」那一行仍按它**自己**
 *  的状态着色；改释义正文时，下方的例句 / 近义词块也不受影响。
 *  （决定九原文写的是「子树里有人动过」，那会让整条释义连例句一起变色；用户的口径更细。）
 *
 *  用户建的容器整棵子树取 personal 由调用处的 `inheritedUser` 传递，不靠这里递归。 */
export function containerState(fv: FieldValue, inUserContainer: boolean): Exclude<FieldState, 'none'> {
  if (inUserContainer || fv.source === 'user') return 'personal'
  const dirty = (n: FieldValue): boolean =>
    n.edited || n.source === 'user' ||
    (n.children ?? []).some(c => !(c.children?.length) && dirty(c))
  return dirty(fv) ? 'edited' : 'original'
}
