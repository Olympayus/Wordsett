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
  /**
   * 题面要标的词性（v0.6.2，条目 5）。有例句时等于 `matchedPos`（跟着例句走），
   * 否则是该词第一个词性。`recognize` / `recall` / `english_def` 三个模板读的是这个字段
   * （services/reviewService.ts:93,103,108），不是 `matchedPos`——后者是填空专用的显式名字。
   */
  partOfSpeech: string
  translation: string
  definition: string
  example: string
  /**
   * 与 `example` 配对的释义（v0.6.2，条目 5 起改为沿 `parent_id` 上溯，取代 v0.6.1 的
   * display_order 序位近似）。填空出题时会把「____ 在句中意为 xxx」注在挖空旁，所以这里必须是
   * **该例句所在义项**的释义：最近的 `english_definition` 祖先 → 该词性父下的第一条
   * `chinese_definition` → 该词第一条 `chinese_definition`（spec §3.2 的三档兜底）。
   * 三档都取不到时为空串，此时填空只挖空、不标注含义。
   */
  exampleGloss: string
  /**
   * 该例句所属词性父的值（v0.6.2，条目 5）。与 `exampleGloss` 同源上溯：
   * 例句行沿 parent_id 上溯，最近的 `english_definition` 祖先是释义、最近的
   * `part_of_speech` 祖先是词性。取不到时沿用 `partOfSpeech`（该词第一个词性），
   * 使填空题的括号有值可标，而不是留空。
   */
  matchedPos: string
  distractors: string[]
}
