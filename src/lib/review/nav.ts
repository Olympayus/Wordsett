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
