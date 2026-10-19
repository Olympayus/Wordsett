import type { FieldDefinition } from '../types/field'

/**
 * 就地编辑的键盘契约（v0.7.4 任务 14）——**纯函数**：只读字段定义的一个字段，返回一个 handler。
 *
 * 抽成独立模块而不是住在 `WordWorkbench.tsx` 里，有两个理由：
 * ① 量宽那侧（`lib/measureText.ts`）与它是同一批改动、同一套不变量，两边都不必反向 import 组件；
 * ② 它是纯函数，测试可以直接驱动（`lib/editKeyDown.test.ts`）——挂在组件文件里就只能靠源码形状守卫。
 *
 * 挂载点：**编辑中的 input / textarea 自己**的 `onKeyDown`，不做 window 级。window 级已有一个
 * `Esc` 负责关「＋ 添加」浮层，再挂一个 window 级会与它互相打架。
 *
 * 行为：多行字段里 Enter 是保存、Shift+Enter 换行（用户决定）；单行字段 Enter 即保存；Esc 取消。
 * 两处 `preventDefault` 都做：不拦的话 textarea 会真的换行，与「Enter ＝ 保存」的语义相反。
 *
 * `isComposing` 守卫不可省：中文输入法**上屏的那一下也是 Enter**，不拦住就会把正在输入的拼音
 * 连同候选一起当成「保存」提交、当场退出编辑（同 `PhoneticArea` 既有的那条守卫）。
 */
export function editKeyDown(fieldType: FieldDefinition['fieldType'], onSave: () => void, onCancelEdit: () => void) {
  return (e: { key: string; shiftKey: boolean; nativeEvent: { isComposing: boolean }; preventDefault: () => void }) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Escape') { e.preventDefault(); onCancelEdit() }
    if (e.key === 'Enter' && (fieldType !== 'multiline' || !e.shiftKey)) {
      e.preventDefault(); onSave()
    }
  }
}
