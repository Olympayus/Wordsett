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
  /**
   * 与 `example` 配对的释义（v0.6.1 后修）。填空出题时会把「____ 在句中意为 xxx」注在挖空旁，
   * 所以这里必须是**该例句所在义项**的释义——两个词典的例句都挂在英文释义下，中文释义若无
   * 例句则取同一序位的中文条目。取不到配对时为空串，此时填空只挖空、不标注含义。
   */
  exampleGloss: string
  distractors: string[]
}
