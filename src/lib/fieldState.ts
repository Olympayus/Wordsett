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
