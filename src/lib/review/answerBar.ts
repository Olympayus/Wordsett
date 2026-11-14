export type AnswerBarMode = 'none' | 'rate' | 'next'

/**
 * 复习页底栏该出哪一组控件（v0.7.6）。
 *
 * 状态完全由「是否已揭示」与「本次作答是否已提交」决定：
 * 未揭示时底栏留空（题面还没答，没有可推的动作）；已揭示但未提交时出三个评分键；
 * 一旦提交（无论刚刚评过分还是回看旧题）就只剩「下一题」。
 *
 * `rated` 是输入形状的一部分，但这里刻意不读它——回看态的已评分旧题与刚评完分的题
 * 都要给「下一题」，读它只会多出一条与 `answeredNow` 打架的分支。
 */
export function answerBarMode(i: { revealed: boolean; answeredNow: boolean; rated: boolean }): AnswerBarMode {
  if (!i.revealed) return 'none'
  return i.answeredNow ? 'next' : 'rate'
}
