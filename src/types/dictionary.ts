import type { FieldSource } from './field'

export interface DictionaryEntry {
  word: string
  normalizedWord: string
  source: 'ecdict' | 'wordnet'
  fields: DictionaryField[]
}

export interface DictionaryField {
  key: string
  value: string
  children?: DictionaryField[]
  /**
   * 来源标记（v0.8.x 词典合并）。两个 parser **都不写**它——由 `lib/dictMerge.mergeSources`
   * 按 entry 自带的 source 逐层盖章，这样 parser 的签名与输出保持原样。
   * 消费方两处：合并树的行尾小标记，以及 buildMergeInputs 的 tempId 前缀。
   */
  source?: FieldSource
}

export interface PendingWord {
  lemma: string
  fieldSelections: {
    fieldKey: string
    value: string
    source: FieldSource
    selected: boolean
    parentFieldKey?: string
    children?: PendingWord['fieldSelections']
  }[]
}
