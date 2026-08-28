import type { MergeFieldInput } from '../services/wordService'
import type { TitleMeta } from '../providers/titleMeta'

export interface TitleStripSelection { phonetic: boolean; wordRoot: boolean }

export function wordRootItemText(r: { class: string; root: string; meaning: string; origin: string }): string {
  return `${r.class}「${r.root}」= ${r.meaning}${r.origin ? `（${r.origin}）` : ''}`
}

export function buildTitleMetaInputs(
  meta: Pick<TitleMeta, 'phonetic' | 'wordRoots'>,
  sel: TitleStripSelection
): MergeFieldInput[] {
  const out: MergeFieldInput[] = []
  if (sel.phonetic && meta.phonetic) {
    out.push({ key: 'phonetic', value: meta.phonetic, source: 'ecdict', tempId: 'ecdict:title-phonetic' })
  }
  if (sel.wordRoot && meta.wordRoots.length > 0) {
    out.push({ key: 'word_root', value: '', source: 'ecdict', tempId: 'ecdict:title-root' })
    meta.wordRoots.forEach((r, i) => {
      out.push({
        key: 'word_root_item', value: wordRootItemText(r), source: 'ecdict',
        tempId: `ecdict:title-root-${i}`, parentTempId: 'ecdict:title-root',
      })
    })
  }
  return out
}