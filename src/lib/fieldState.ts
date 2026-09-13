import type { FieldValue } from '../types/field'

// 字段来源三态（v0.5.2 §3）：中性（词典原样）/ 已编辑（用户改过词典数据）/ 个人（用户新增）。
// 从 WordWorkbench 抽出，供字段卡容器与音标 / 词根 chip 共用同一份真相。
export type FieldState = 'original' | 'edited' | 'personal'

/** 编辑优先于来源：改过的词典字段算「已编辑」，只有未改动的用户新增才算「个人」 */
export const fieldState = (fv: FieldValue): FieldState =>
  fv.edited ? 'edited' : (fv.source === 'user' ? 'personal' : 'original')

/**
 * 三态底色。卡片容器与 chip 都用它上色，避免两处各写一份色值而漂移。
 * 注意：卡片另有三态左边条（--color-weave-*）与边框，那属卡片的结构语义，不在此表内。
 */
export const FIELD_STATE_BG: Record<FieldState, string> = {
  original: 'var(--color-surface-sunken)',
  edited: 'var(--color-brand-softer)',
  personal: 'var(--color-accent-soft)',
}
