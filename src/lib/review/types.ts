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
   * 认读题用的词性（v0.6.2，条目 5）。有例句时等于 `matchedPos`（跟着例句走），
   * 否则是该词第一个词性。`recognize`（prompt 与 answer 两侧）读的是这个字段——
   * `recall` 自 v0.6.3 条目 4a 起改读 `firstSensePos`，`english_def` 自评审 F2 起改读
   * `firstDefPos`（这两处题面同时印释义，释义与词性必须同一义项），填空读 `matchedPos`。
   * 这几处刻意各取所需，**别合并**。
   */
  partOfSpeech: string
  translation: string
  definition: string
  example: string
  /**
   * 与 `example` 配对的释义（v0.6.2，条目 5 起改为沿 `parent_id` 上溯，取代 v0.6.1 的
   * display_order 序位近似）。填空出题时它是 `prompt.gloss`：不再拼进挖空句，而是由前端
   * 在句子下方另起一行渲染「____ 在句中意为 xxx」。所以这里必须是**该例句所在义项**的释义：
   * 最近的 `english_definition` 祖先 → 该词性父下的第一条 `chinese_definition` →
   * 该词第一条 `chinese_definition`（spec §3.2 的三档兜底）。
   * 三档都取不到时为空串，此时该行不渲染，题面只剩挖空句。
   */
  exampleGloss: string
  /**
   * 该例句所属词性父的值（v0.6.2，条目 5）。与 `exampleGloss` 同源上溯：
   * 例句行沿 parent_id 上溯，最近的 `english_definition` 祖先是释义、最近的
   * `part_of_speech` 祖先是词性。取不到时沿用 `partOfSpeech`（该词第一个词性），
   * 使填空题的括号有值可标，而不是留空。
   */
  matchedPos: string
  /**
   * 第一个义项的词性（v0.6.3 条目 4a）。与 `translation` **同源**：两者都取自该词第一条
   * `chinese_definition` 及其 `part_of_speech` 祖先。
   *
   * 与另外两个 pos 字段的区别是刻意的，**别合并**：
   *   - `partOfSpeech` / `matchedPos` = 跟着**例句**走的词性
   *   - `firstSensePos`             = 跟着**中文释义**走的词性
   * 中译英题面同时印出中文释义与词性（条目 3 之后是「释义 (词性)」并排），两者必须同一义项，
   * 否则会出现「第一义项的释义 + 第二义项的词性」。填空用前者，中译英用这个。
   * 取不到祖先时退到 `fallbackPos`（该词第一个 `part_of_speech`），与 `translation` 的兜底
   * 方向一致（都是「该词第一条」），使括号有值可标。**不是** `partOfSpeech`——那个值跟着
   * 例句走，有例句时与这里不同源。
   */
  firstSensePos: string
  /**
   * 第一条英文释义所属义项的词性（v0.6.3 评审 F2）。与 `definition` **同源**：两者都取自
   * 该词第一条 `english_definition` 及其 `part_of_speech` 祖先。
   *
   * 与 `firstSensePos` 同一条原则（释义与词性必须同一义项），只是走英释义那一支：
   * 英释义题面把 `definition` 与这个词性并排印在一行（条目 3 之后是「definition (pos)」），
   * 用 `partOfSpeech` 就会印出「第一义项的英文释义 + 例句所属义项的词性」——正是 4a 在
   * 中译英上修掉的同一类错配，多义项词上照样可见（`src/db/review.test.ts` 的 seedMultiPos 形状）。
   * 取不到祖先时退到 `fallbackPos`（该词第一个 `part_of_speech`），与 `firstSensePos` 的兜底
   * 方向一致（都是「该词第一条」），使括号有值可标。**不是** `partOfSpeech`。
   */
  firstDefPos: string
  distractors: string[]
}
