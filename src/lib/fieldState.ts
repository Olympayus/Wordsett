import type { FieldValue } from '../types/field'

// 字段来源三态（v0.5.2 §3）：中性（词典原样）/ 已编辑（用户改过词典数据）/ 个人（用户新增）。
// 从 WordWorkbench 抽出，供字段卡容器与音标 / 词根 chip 共用同一份真相。
export type FieldState = 'original' | 'edited' | 'personal'

/** 编辑优先于来源：改过的词典字段算「已编辑」，只有未改动的用户新增才算「个人」 */
export const fieldState = (fv: FieldValue): FieldState =>
  fv.edited ? 'edited' : (fv.source === 'user' ? 'personal' : 'original')

/**
 * 三态底色。**音标行是它仅剩的消费点**（PhoneticArea.tsx：编者模式下按来源三态上底）。
 * 字段卡（v0.7.2 起）已不再用底色编码，改由形状承载——SourceMark 的方点与 SourceBar 的
 * 左条（`--color-weave-edited` 在 SourceMark.tsx 仍在用，故 weave token 不删）。
 */
export const FIELD_STATE_BG: Record<FieldState, string> = {
  original: 'var(--color-surface-sunken)',
  edited: 'var(--color-brand-softer)',
  personal: 'var(--color-accent-soft)',
}
