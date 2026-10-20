/**
 * 词条的破坏性动作确认文案（Task 5 抽出）。
 *
 * 桌面工作台（`WordWorkbench.handleDelete`）与手机顶栏（`MobileAppBar`）做的是同一件事：
 * 删掉**当前选中词**，且都要先弹同一句确认。确认文案两处各写一遍迟早会漂
 * （「不可撤销」四个字少一处，用户对同一个动作就会得到两种承诺），故收在这里。
 *
 * 移动（移入 / 移回储藏库）的确认文案不在这里：那一套属于 `lib/archiveMove.ts`
 * （单个词与批量两条入口共用）。
 */

/** `useUiStore.confirm` 的入参（非 alert）。缺省肯定按钮是「删除」，正是本动作要的那个词。 */
export function deleteWordConfirmRequest(
  lemma: string,
): { title: string; message: string; danger: true } {
  return {
    title: '删除单词',
    message: `确定删除单词“${lemma}”吗？此操作不可撤销。`,
    danger: true,
  }
}
