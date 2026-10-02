/**
 * 确认弹窗点遮罩是否等同于点次按钮（`ConfirmDialog` 的遮罩 `onClick`）。
 *
 * 抽成纯函数是为了可单测：当这个弹窗是首次关窗提示时，`resolveConfirm(false)`
 * 等于**直接退出应用**——这一个布尔值就是挡住误点关掉应用的闸，值得钉住。
 * 语义不变：缺省（`undefined`）可关闭，只有显式 `false` 才禁用遮罩关闭。
 */
export function scrimDismisses(dismissable: boolean | undefined): boolean {
  return dismissable !== false
}
