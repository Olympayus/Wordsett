export type Template = 'recognize' | 'cloze' | 'recall' | 'english_def' | 'listen'

export type InitialFamiliarity = 1 | 2 | 3

export type ReviewMode = 'review' | 'practice'

export type ReviewStrategy = 'today' | 'free'

/** 自由练习的范围（spec §3.3）。放在这里而非组件内，避免 FreeScopePanel ↔ FreeScopeTabs 循环引用。 */
export type FreeScopeKind = 'random' | 'today' | 'weak' | 'category'

/** 出题所需的词条内容快照（db 层与 service 层共用，避免 db → service 的类型依赖）。 */
export interface CardContent {
  lemma: string
  phonetic: string
  partOfSpeech: string
  translation: string
  definition: string
  example: string
  distractors: string[]
}
