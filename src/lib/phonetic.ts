import type { FieldValue } from '../types/field'

// 音标两侧加斜杠（值本身已含斜杠则不重复加），如 bru: → /bru:/
export function formatPhonetic(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('/') && trimmed.endsWith('/')) return trimmed
  return `/${trimmed}/`
}

/**
 * 词根项选择（v0.5.2 §1）：把各 word_root 容器下的子项按容器顺序打平成一个列表。
 * 原实现在 WordWorkbench 内联为 flatMap + filter，抽出来便于单测与复用。
 * 保留规则：正在编辑的项、有值的项、或编者模式下全部项。
 */
export function selectWordRootItems(
  containers: FieldValue[],
  editingId: string | null,
  editorMode: boolean,
): FieldValue[] {
  return containers
    .filter(fv => fv.id === editingId || (fv.children?.length ?? 0) > 0 || editorMode)
    .flatMap(fv => fv.children ?? [])
    .filter(item => item.id === editingId || item.value.trim() !== '' || editorMode)
}
