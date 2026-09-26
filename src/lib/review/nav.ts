/**
 * 答题导航的可达性（spec §3.7）。
 *
 * 规则只有一条，但字面写法很容易搞错。规格的原始表述是「右侧那张比当前题更靠后、
 * 且尚未作答 → 右箭头置灰」。若照字面实现（index+1 未作答即置灰），用户从第 5 题翻回
 * 第 4 题后就再也回不到第 5 题——第 5 题正是当前题、未作答，右箭头被灰掉，困死。
 *
 * 关键前提：已答集合永远是队列的**前缀**（答案按顺序 append）。设 k = 已答条数，
 * 则卡片 0..k-1 已答、k..N-1 未答。于是「存在 j > index 且 queue[j] 已答」等价于
 * `index < k`，也就是**当前这张卡已作答**。据此：
 *
 *   · 站在未作答的当前题上（index === k）→ 右箭头置灰，不能跳过未答题偷看
 *   · 站在已答过的卡上（index < k）→ 右箭头可用：要么在历史里移动，要么回到当前题
 *   · 刚评完分的卡也在 answered 里（index === k-1 < k）→ 右箭头可用，正常推进
 */

/** 当前 index 指向的卡是否已作答。回看态与「可推进」共用这一判据。 */
export function currentAnswered(
  queue: { cardId: string }[],
  answered: { cardId: string }[],
  index: number,
): boolean {
  const card = queue[index]
  if (!card) return false
  return answered.some(a => a.cardId === card.cardId)
}

export function canGoBack(index: number): boolean {
  return index > 0
}

export function canGoForward(
  queue: { cardId: string }[],
  answered: { cardId: string }[],
  index: number,
): boolean {
  if (index + 1 >= queue.length) return false
  return currentAnswered(queue, answered, index)
}

export function answeredCount(answered: { cardId: string }[]): number {
  return answered.length
}

/**
 * 选择题判色的驱动值（v0.6.2 条目 11）。
 *
 * `AnswerInput` 以 `revealedInput !== undefined` 决定是否切到「已判分」形态并着对错色，
 * 而 `''` 也算已揭示。故「点完选项立刻着色」等价于「一提交就给出非 undefined 的值」——
 * 判据不是「有内容」，是这个 undefined / 非 undefined 的差别。
 *
 * 关键在跳过路径：跳过交上来的是 `''`，刻意**不**取 undefined，于是跳过后选项同样着色
 * 并标出正确答案，与 ReviewArena 里「评分成功即视为已揭示」同向。若这里写成
 * `lastInput || pastInput` 之类把 `''` 吞掉的判断，跳过就会退回未着色的形态。
 *
 * @param revealed  本次作答是否已揭示（handleSubmit / 评分成功都会置起）
 * @param lastInput 本次作答原文；跳过时为 `''`
 * @param pastInput 回看态从 store 的 answered 里回放的作答原文；未揭示时为 undefined
 */
export function revealedInputFor(
  revealed: boolean, lastInput: string, pastInput: string | undefined,
): string | undefined {
  return revealed ? lastInput : pastInput
}
